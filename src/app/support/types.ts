import type { Role } from "@/lib/roles";

export type SupportTicket = {
  id: string;
  content: string;
  isSecret: boolean;
  createdAt: string;
  isMine: boolean;
  canDelete: boolean;
  authorId: string | null;
  authorName: string;
  authorAvatar: string | null;
  authorRole: Role | null;
  replyCount: number;
};

export type SupportReplyItem = {
  id: string;
  content: string;
  createdAt: string;
  staffName: string;
  canDelete: boolean;
};
