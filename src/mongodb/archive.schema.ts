import mongoose, { Schema, Document } from 'mongoose';

export interface IArchive extends Document {
  user_id: number;
  other_id: number;
  message_id: number;
  direction: 'me->other' | 'other->me';
  text?: string;
  forwarded: boolean;
  media?: {
    fileName?: string;
    size?: number;
    mimeType?: string;
    ephemeral?: boolean;
    localPath?: string;
  } | null;
  date: Date;
  created_at: Date;
}

const ArchiveSchema = new Schema<IArchive>({
  user_id: {
    type: Number,
    required: true,
    index: true,
  },
  other_id: {
    type: Number,
    required: true,
    index: true,
  },
  message_id: {
    type: Number,
    required: true,
  },
  direction: {
    type: String,
    enum: ['me->other', 'other->me'],
    required: true,
  },
  text: {
    type: String,
    required: false,
  },
  forwarded: {
    type: Boolean,
    default: false,
  },
  media: {
    type: {
      fileName: String,
      size: Number,
      mimeType: String,
      ephemeral: Boolean,
      localPath: String,
    },
    required: false,
  },
  date: {
    type: Date,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

ArchiveSchema.index({ user_id: 1, other_id: 1, message_id: 1 });

export const Archive = mongoose.model<IArchive>('Archive', ArchiveSchema);
