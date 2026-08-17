export type LicenseType = 'subscription' | 'orchestrator' | 'intelligence-module';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';
export type LicenseStatus = 'unredeemed' | 'active' | 'revoked';

export interface Subscription {
  uid: string;
  status: SubscriptionStatus;
  trialEndsAt: number | null;
  currentPeriodEnd: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface License {
  id: string;
  ownerUid: string | null;
  type: LicenseType;
  moduleId: string | null;
  boundHardwareId: string | null;
  status: LicenseStatus;
  createdAt: number;
  activatedAt: number | null;
}

export interface EntitlementSnapshot {
  uid: string;
  subscription: Subscription;
  licenses: License[];
}

export type ServiceName =
  | 'ai-analysis'
  | 'cloud-sync'
  | 'intelligence-modules'
  | 'companion-provisioning'
  | 'orchestrator';

export const SERVICE_NAMES: readonly ServiceName[] = [
  'ai-analysis',
  'cloud-sync',
  'intelligence-modules',
  'companion-provisioning',
  'orchestrator',
];
