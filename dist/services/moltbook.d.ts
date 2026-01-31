export interface MoltbookAgent {
    id: string;
    name: string;
    karma: number;
    avatarUrl?: string;
    isVerified: boolean;
    createdAt: string;
    followerCount: number;
    postCount: number;
    commentCount: number;
}
export declare function verifyAgentIdentity(identityToken: string): Promise<MoltbookAgent>;
