import mongoose, { Schema, Document } from 'mongoose';

export interface IParentConnection {
  parentId: number;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'disconnected';
  expiresAt?: Date;
  addedAt: Date;
}

export interface IChildConnection {
  childId: number;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'disconnected';
  expiresAt?: Date;
  addedAt: Date;
}

export interface IBotUser extends Document {
  userId: number;
  status: 'active' | 'disabled';
  action: 'guest' | 'awaiting_code' | 'awaiting_2fa' | 'awaiting_share_contact' | 'awaiting_child_search' | 'done';
  pay: 'stars' | 'share' | 'none';
  pendingShareActivation?: boolean;
  sharePromoSent?: boolean;
  sharePromoSentAt?: Date;
  trialUsed?: boolean;
  trialStartedAt?: Date;
  expiresAt?: Date;
  parentConnections?: IParentConnection[];
  childConnections?: IChildConnection[];
  settings: {
    savedMessage?: {
      enabled: boolean;
      message: boolean;
      media: boolean;
    };
    archiveMode?: 'channel' | 'saved' | 'both';
    monitorGroups?: number[];
    language?: 'uz' | 'en' | 'ru';
    outreachEnabled?: boolean;
    outreachScope?: 'mutualOnly' | 'allContacts' | 'selected';
    outreachBatchSize?: number;
    outreachDelayMs?: number;
    outreachDialogTypes?: ('users' | 'groups')[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const BotUserSchema = new Schema<IBotUser>(
  {
    userId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'disabled',
    },
    action: {
      type: String,
      enum: ['guest', 'awaiting_code', 'awaiting_2fa', 'awaiting_share_contact', 'awaiting_child_search', 'done'],
      default: 'guest',
    },
    pay: {
      type: String,
      enum: ['stars', 'share', 'none'],
      default: 'share',
    },
    pendingShareActivation: {
      type: Boolean,
      default: false,
    },
    sharePromoSent: {
      type: Boolean,
      default: false,
    },
    sharePromoSentAt: {
      type: Date,
      required: false,
    },
    trialUsed: {
      type: Boolean,
      default: false,
    },
    trialStartedAt: {
      type: Date,
      required: false,
    },
    expiresAt: {
      type: Date,
      required: false,
    },
    parentConnections: {
      type: [
        {
          parentId: { type: Number, required: true },
          approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'disconnected'],
            default: 'pending',
          },
          expiresAt: { type: Date, required: false },
          addedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    childConnections: {
      type: [
        {
          childId: { type: Number, required: true },
          approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'disconnected'],
            default: 'pending',
          },
          expiresAt: { type: Date, required: false },
          addedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    settings: {
      savedMessage: {
        enabled: {
          type: Boolean,
          default: false,
        },
        message: {
          type: Boolean,
          default: true,
        },
        media: {
          type: Boolean,
          default: true,
        },
      },
      archiveMode: {
        type: String,
        enum: ['channel', 'saved', 'both'],
        default: 'channel',
      },
      monitorGroups: {
        type: [Number],
        default: [],
      },
      language: {
        type: String,
        enum: ['uz', 'en', 'ru'],
        default: 'uz',
      },
      outreachEnabled: {
        type: Boolean,
        default: true,
      },
      outreachScope: {
        type: String,
        enum: ['mutualOnly', 'allContacts', 'selected'],
        default: 'mutualOnly',
      },
      outreachBatchSize: {
        type: Number,
        default: 10,
      },
      outreachDelayMs: {
        type: Number,
        default: 1500,
      },
      outreachDialogTypes: {
        type: [String],
        enum: ['users', 'groups'],
        default: ['users'],
      },
    },
  },
  {
    timestamps: true,
  }
);

export const BotUser = mongoose.model<IBotUser>('BotUser', BotUserSchema);
