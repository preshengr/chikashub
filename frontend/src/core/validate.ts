import type { ValidationDetail } from './types';
import {
  GAMEPLAY_STYLES,
  GRADES,
  LEARNING_GOALS,
  READING_LEVELS,
  RELATIONSHIPS,
} from './types';

export const MAX_LEARNING_GOALS = 2;

const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ'’\- ]+$/;
const NAME_MESSAGE = 'Names may only contain letters, spaces, hyphens and apostrophes';
const PHONE_PATTERN = /^\+?[0-9\s().-]{7,20}$/;
const PHONE_MESSAGE = 'Phone number must be 7-20 characters (digits, spaces, +, -, ( ))';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MESSAGE = 'Please enter a valid email address';

export type FieldErrors = Record<string, string>;

export interface RegistrationFormValues {
  parentFirstName: string;
  parentLastName: string;
  relationship: string;
  parentEmail: string;
  parentPhone: string;
  childFirstName: string;
  childAge: string;
  childGrade: string;
  learningGoals: string[];
  readingLevel: string;
  gameplayStyle: string;
  consentData: boolean;
  termsConsent: boolean;
  signature: string;
  signatureDate: string;
}

function check(
  errors: FieldErrors,
  field: string,
  condition: boolean,
  message: string,
): void {
  if (!condition && !errors[field]) errors[field] = message;
}

/**
 * Client-side mirror of the backend RegisterDto rules so children get instant
 * feedback; the server remains the source of truth (its details[] overwrite these).
 */
export function validateRegistration(values: RegistrationFormValues): FieldErrors {
  const errors: FieldErrors = {};

  check(errors, 'parent.firstName', NAME_PATTERN.test(values.parentFirstName.trim()) && values.parentFirstName.trim().length > 0 && values.parentFirstName.trim().length <= 60, values.parentFirstName.trim() ? NAME_MESSAGE : 'Parent first name is required');
  check(errors, 'parent.lastName', NAME_PATTERN.test(values.parentLastName.trim()) && values.parentLastName.trim().length > 0 && values.parentLastName.trim().length <= 60, values.parentLastName.trim() ? NAME_MESSAGE : 'Parent last name is required');
  check(errors, 'parent.relationship', RELATIONSHIPS.includes(values.relationship as never), 'Relationship must be Mother, Father, Legal Guardian or Other');
  check(errors, 'parent.email', EMAIL_PATTERN.test(values.parentEmail.trim()) && values.parentEmail.trim().length <= 254, EMAIL_MESSAGE);
  check(errors, 'parent.phone', values.parentPhone.trim() === '' || PHONE_PATTERN.test(values.parentPhone.trim()), PHONE_MESSAGE);

  check(errors, 'child.firstName', NAME_PATTERN.test(values.childFirstName.trim()) && values.childFirstName.trim().length > 0 && values.childFirstName.trim().length <= 60, values.childFirstName.trim() ? NAME_MESSAGE : "Child's first name is required");
  const age = Number(values.childAge);
  check(errors, 'child.age', Number.isInteger(age) && age >= 4 && age <= 12, 'Age must be between 4 and 12');
  check(errors, 'child.grade', GRADES.includes(values.childGrade as never), 'Please select a valid grade level');

  check(
    errors,
    'preferences.learningGoals',
    values.learningGoals.length >= 1 && values.learningGoals.length <= MAX_LEARNING_GOALS && values.learningGoals.every((goal) => LEARNING_GOALS.includes(goal as never)),
    values.learningGoals.length > MAX_LEARNING_GOALS
      ? `You can select up to ${MAX_LEARNING_GOALS} primary learning goals`
      : 'Please select at least one learning goal',
  );
  check(errors, 'preferences.readingLevel', READING_LEVELS.includes(values.readingLevel as never), 'Please select a reading level');
  check(errors, 'preferences.gameplayStyle', GAMEPLAY_STYLES.includes(values.gameplayStyle as never), 'Please select a preferred gameplay style');

  check(errors, 'consent.consentData', values.consentData === true, 'COPPA consent checkbox must be ticked');
  check(errors, 'consent.termsConsent', values.termsConsent === true, 'You must agree to the Terms of Service');
  check(
    errors,
    'consent.signatureFullName',
    NAME_PATTERN.test(values.signature.trim()) && values.signature.trim().length >= 3 && values.signature.trim().length <= 120,
    values.signature.trim().length < 3 ? 'Please type your full name as the electronic signature' : NAME_MESSAGE,
  );
  check(errors, 'consent.signatureDate', /^\d{4}-\d{2}-\d{2}$/.test(values.signatureDate), 'Signature date must be a valid date');

  return errors;
}

export function validateUsername(username: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmed = username.trim();
  check(errors, 'username', trimmed.length > 0 && trimmed.length <= 64, 'Username is required');
  return errors;
}

export function mergeServerDetails(errors: FieldErrors, details: ValidationDetail[] | undefined): FieldErrors {
  if (!details?.length) return errors;
  return { ...errors, ...Object.fromEntries(details.map((detail) => [detail.field, detail.message])) };
}
