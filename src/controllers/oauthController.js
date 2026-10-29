import asyncHandler from '../utils/asyncHandler.js';
import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/messages.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import * as oauthService from '../services/oauthService.js';
import * as handoffService from '../services/handoffService.js';
import * as tokenService from '../services/tokenService.js';
import { signFlow, verifySignedFlow, flowCookieOptions } from '../utils/oauthFlow.js';

/**
 * Google OAuth 2.0 endpoints.
 *
 * Browser flow:
 *   GET  /auth/google          -> sets a signed HttpOnly flow cookie, 302 to Google
 *   GET  /auth/google/callback -> verifies state/nonce, exchanges the code,
 *                                 then answers with tokens (JSON mode) or a
 *                                 redirect carrying a one-time handoff code
 *                                 (redirect mode, when OAUTH_REDIRECT_URL is set)
 *   POST /auth/google/exchange -> swaps a handoff code for the token pair
 *
 * Account-linking flow (authenticated):
 *   POST   /auth/google/link   -> { authorizationUrl }, cookie is set on the reply
 *   GET    /auth/google/links  -> list linked providers
 *   DELETE /auth/google/link   -> unlink (refuses if it is the last sign-in method)
 */

/** Google's issuer values for the `iss` callback hint (CSRF hardening). */
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const meta = (req) => ({
  userAgent: req.headers['user-agent'],
  requestId: req.requestId,
});

const setFlowCookie = (res, flow) =>
  res.cookie(env.oauth.cookieName, signFlow(flow), flowCookieOptions());

const clearFlowCookie = (res) =>
  res.clearCookie(env.oauth.cookieName, flowCookieOptions({ clear: true }));

/** Append query params to the configured SPA URL (never built from input). */
const withParams = (base, params) => {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

/**
 * Failure path of the browser callback.
 * In redirect mode the SPA gets a machine-readable error code; otherwise the
 * global error middleware renders the standard JSON error envelope.
 * Unexpected (non-operational) errors are NEVER masked as a redirect.
 */
const failCallback = (res, next, err, isPopup = false) => {
  if (env.oauth.redirectUrl && err instanceof AppError) {
    res.redirect(
      302,
      withParams(env.oauth.redirectUrl, {
        error: err.code,
        error_description: err.message,
        popup: isPopup ? '1' : undefined,
      }),
    );
    return;
  }
  next(err);
};

/** GET /api/v1/auth/google — start the sign-in flow. */
export const start = asyncHandler(async (req, res) => {
  const { url, flow } = await oauthService.startLogin({
    loginHint: req.query.login_hint,
    prompt: req.query.prompt,
    popup: req.query.popup,
  });

  setFlowCookie(res, flow);
  res.redirect(302, url);
});

/** GET /api/v1/auth/google/callback — Google redirects the browser here. */
export const callback = asyncHandler(async (req, res, next) => {
  const flow = verifySignedFlow(req.cookies?.[env.oauth.cookieName]);

  // The flow cookie is consumed on every attempt: a replayed callback
  // therefore has no state left and fails the CSRF check below.
  clearFlowCookie(res);

  try {
    // 1. CSRF: the `state` echo must match what we signed into the cookie.
    oauthService.assertFlow(flow, req.query.state);

    // 2. Google's issuer hint, when present, must be Google.
    if (req.query.iss && !GOOGLE_ISSUERS.has(req.query.iss)) {
      throw AppError.unauthenticated(
        'Unexpected issuer on the Google callback',
        ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
      );
    }

    // 3. The user cancelled / Google refused consent.
    if (req.query.error) {
      const denied = req.query.error === 'access_denied';
      throw new AppError(
        denied ? 400 : 401,
        denied ? ERROR_CODES.OAUTH_ACCESS_DENIED : ERROR_CODES.OAUTH_CODE_EXCHANGE_FAILED,
        denied
          ? 'Google sign-in was cancelled or refused'
          : `Google returned an error: ${req.query.error}`,
      );
    }

    const redirectMode = Boolean(env.oauth.redirectUrl);

    const result = await oauthService.handleCallback({
      code: req.query.code,
      state: req.query.state,
      flow,
      meta: meta(req),
      deferTokens: redirectMode,
    });

    // --- Redirect mode: never put tokens in a URL. ---
    if (redirectMode) {
      const handoff = await handoffService.createHandoff({
        user: result.user,
        purpose: result.purpose,
        payload:
          result.purpose === 'link'
            ? { linked: true, alreadyLinked: Boolean(result.alreadyLinked) }
            : { created: Boolean(result.created) },
      });

      res.redirect(
        302,
        withParams(env.oauth.redirectUrl, {
          handoff,
          popup: flow?.pop ? '1' : undefined,
        }),
      );
      return;
    }

    // --- JSON mode (API clients, tests, popup-based SPAs). ---
    const linked = result.purpose === 'link';
    res.status(linked ? 200 : result.created ? 201 : 200).json({
      success: true,
      message: linked
        ? 'Google account linked successfully'
        : result.created
          ? 'Account created successfully'
          : 'Logged in successfully',
      data: oauthService.presentResult(
        result,
        linked
          ? { linked: true, alreadyLinked: Boolean(result.alreadyLinked) }
          : { created: Boolean(result.created) },
      ),
    });
  } catch (err) {
    failCallback(res, next, err, Boolean(flow?.pop));
  }
});

/** POST /api/v1/auth/google/exchange — one-time handoff code -> tokens. */
export const exchange = asyncHandler(async (req, res) => {
  const { user, purpose, payload } = await handoffService.consumeHandoff(req.body.handoff);

  // A link confirmation does not mint new tokens: the caller is already
  // authenticated and must keep the session it started with.
  if (purpose === 'link') {
    res.status(200).json({
      success: true,
      message: 'Google account linked successfully',
      data: {
        user: sanitizeUser(user),
        linked: true,
        alreadyLinked: Boolean(payload.alreadyLinked),
      },
    });
    return;
  }

  const tokens = await tokenService.issueTokens(user, meta(req));

  res.status(200).json({
    success: true,
    message: payload.created ? 'Account created successfully' : 'Logged in successfully',
    data: { user: sanitizeUser(user), ...tokens, created: Boolean(payload.created) },
  });
});

/** POST /api/v1/auth/google/link — start linking Google to the caller. */
export const startLink = asyncHandler(async (req, res) => {
  const { url, flow } = await oauthService.startLink(req.user, {
    loginHint: req.body?.login_hint,
  });

  setFlowCookie(res, flow);
  res.status(200).json({
    success: true,
    message: 'Open authorizationUrl in the browser to continue',
    data: { authorizationUrl: url },
  });
});

/** GET /api/v1/auth/google/links — providers linked to the caller. */
export const links = asyncHandler(async (req, res) => {
  const result = await oauthService.listLinks(req.user);

  res.status(200).json({
    success: true,
    message: 'Linked accounts fetched successfully',
    data: result,
  });
});

/** DELETE /api/v1/auth/google/link — unlink Google from the caller. */
export const unlink = asyncHandler(async (req, res) => {
  const result = await oauthService.unlinkAccount(req.user, meta(req));

  res.status(200).json({
    success: true,
    message: 'Google account unlinked successfully',
    data: result,
  });
});

export default { start, callback, exchange, startLink, links, unlink };
