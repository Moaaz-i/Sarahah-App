import mongoose from "mongoose";

const oauthAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },

    provider: {
      type: String,
      required: [true, "Provider is required"],
      enum: ["google"],
    },

    providerId: {
      type: String,
      required: [true, "Provider ID is required"],
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

oauthAccountSchema.index({ provider: 1, providerId: 1 }, { unique: true });

// A user may link at most ONE account per provider.
oauthAccountSchema.index({ user: 1, provider: 1 }, { unique: true });

const OAuthAccount = mongoose.model("OAuthAccount", oauthAccountSchema);

export default OAuthAccount;
