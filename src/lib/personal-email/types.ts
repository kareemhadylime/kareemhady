import { z } from 'zod';
import {
  CategorySlug,
  MatchType,
  ClassificationMethod,
  PersonalEmailCategoryRow,
  PersonalEmailRuleRow,
  AiClassificationOutput,
} from './schema';

export type CategorySlug = z.infer<typeof CategorySlug>;
export type MatchType = z.infer<typeof MatchType>;
export type ClassificationMethod = z.infer<typeof ClassificationMethod>;
export type PersonalEmailCategory = z.infer<typeof PersonalEmailCategoryRow>;
export type PersonalEmailRule = z.infer<typeof PersonalEmailRuleRow>;
export type AiClassification = z.infer<typeof AiClassificationOutput>;

export type EmailFeatures = {
  fromAddress: string;
  fromDomain: string;
  toAddress: string;
  subject: string;
  hasListUnsubscribe: boolean;
  gmailLabelIds: string[];
  gmailLabelNames: string[];
  bodyExcerpt: string;
  receivedIso: string | null;
};
