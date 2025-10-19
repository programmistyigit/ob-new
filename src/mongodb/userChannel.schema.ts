import mongoose, { Schema, Document } from 'mongoose';

export interface IUserChannel extends Document {
  my_user_id: number;
  user_id: number;
  username?: string;
  channel_id: number;
  channel_access_hash?: string;
  channel_title?: string;
  created_at: Date;
}

const UserChannelSchema = new Schema<IUserChannel>({
  my_user_id: {
    type: Number,
    required: true,
    index: true,
  },
  user_id: {
    type: Number,
    required: true,
    index: true,
  },
  username: {
    type: String,
    required: false,
  },
  channel_id: {
    type: Number,
    required: true,
    unique: true,
  },
  channel_access_hash: {
    type: String,
    required: false,
  },
  channel_title: {
    type: String,
    required: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

UserChannelSchema.index({ my_user_id: 1, user_id: 1 }, { unique: true });

export const UserChannel = mongoose.model<IUserChannel>('UserChannel', UserChannelSchema);
