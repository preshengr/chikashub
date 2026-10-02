import { describe, expect, it } from 'vitest';
import {
  MAX_LEARNING_GOALS,
  mergeServerDetails,
  validateRegistration,
  validateUsername,
  type RegistrationFormValues,
} from '../src/core/validate';

function validValues(overrides: Partial<RegistrationFormValues> = {}): RegistrationFormValues {
  return {
    parentFirstName: 'Ada',
    parentLastName: 'Lovelace',
    relationship: 'mother',
    parentEmail: 'ada@example.com',
    parentPhone: '+44 7700 900123',
    childFirstName: 'Mia',
    childAge: '7',
    childGrade: 'grade_1',
    learningGoals: ['math'],
    readingLevel: 'early_reader',
    gameplayStyle: 'story',
    consentData: true,
    termsConsent: true,
    signature: 'Ada Lovelace',
    signatureDate: '2026-10-01',
    ...overrides,
  };
}

describe('registration validation', () => {
  it('accepts a fully valid form', () => {
    expect(validateRegistration(validValues())).toEqual({});
  });

  it('accepts an omitted phone number', () => {
    expect(validateRegistration(validValues({ parentPhone: '' }))).toEqual({});
  });

  it('requires parent names', () => {
    const errors = validateRegistration(validValues({ parentFirstName: ' ', parentLastName: '' }));
    expect(errors['parent.firstName']).toBe('Parent first name is required');
    expect(errors['parent.lastName']).toBe('Parent last name is required');
  });

  it('rejects names with digits or punctuation', () => {
    const errors = validateRegistration(validValues({ parentFirstName: 'Ada3!' }));
    expect(errors['parent.firstName']).toMatch(/letters/);
  });

  it('rejects an invalid email and phone', () => {
    const errors = validateRegistration(validValues({ parentEmail: 'nope', parentPhone: '12' }));
    expect(errors['parent.email']).toBe('Please enter a valid email address');
    expect(errors['parent.phone']).toMatch(/Phone number/);
  });

  it('requires an age between 4 and 12', () => {
    expect(validateRegistration(validValues({ childAge: '13' }))['child.age']).toBe(
      'Age must be between 4 and 12',
    );
    expect(validateRegistration(validValues({ childAge: '3' }))['child.age']).toBe(
      'Age must be between 4 and 12',
    );
    expect(validateRegistration(validValues({ childAge: '4' }))).toEqual({});
  });

  it('requires between one and two learning goals', () => {
    expect(validateRegistration(validValues({ learningGoals: [] }))['preferences.learningGoals']).toBe(
      'Please select at least one learning goal',
    );
    const tooMany = validateRegistration(
      validValues({ learningGoals: ['math', 'reading', 'science'] }),
    );
    expect(tooMany['preferences.learningGoals']).toBe(
      `You can select up to ${MAX_LEARNING_GOALS} primary learning goals`,
    );
    expect(
      validateRegistration(validValues({ learningGoals: ['math', 'reading'] })),
    ).toEqual({});
  });

  it('requires reading level and gameplay style', () => {
    const errors = validateRegistration(
      validValues({ readingLevel: '', gameplayStyle: '' }),
    );
    expect(errors['preferences.readingLevel']).toBe('Please select a reading level');
    expect(errors['preferences.gameplayStyle']).toBe('Please select a preferred gameplay style');
  });

  it('requires both consent checkboxes', () => {
    const errors = validateRegistration(
      validValues({ consentData: false, termsConsent: false }),
    );
    expect(errors['consent.consentData']).toBe('COPPA consent checkbox must be ticked');
    expect(errors['consent.termsConsent']).toBe('You must agree to the Terms of Service');
  });

  it('requires a meaningful electronic signature', () => {
    expect(
      validateRegistration(validValues({ signature: 'Al' }))['consent.signatureFullName'],
    ).toMatch(/full name/);
    expect(
      validateRegistration(validValues({ signature: 'Ada Lovelace' })),
    ).toEqual({});
  });

  it('requires an ISO signature date', () => {
    expect(
      validateRegistration(validValues({ signatureDate: 'tomorrow' }))['consent.signatureDate'],
    ).toBe('Signature date must be a valid date');
  });

  it('reports every problem at once', () => {
    const errors = validateRegistration(
      validValues({
        parentEmail: 'bad',
        childAge: '99',
        consentData: false,
        readingLevel: '',
        gameplayStyle: '',
        learningGoals: [],
      }),
    );
    expect(Object.keys(errors).sort()).toEqual([
      'child.age',
      'consent.consentData',
      'parent.email',
      'preferences.gameplayStyle',
      'preferences.learningGoals',
      'preferences.readingLevel',
    ]);
  });
});

describe('username validation', () => {
  it('rejects an empty username', () => {
    expect(validateUsername('').username).toBe('Username is required');
  });

  it('accepts a username string', () => {
    expect(validateUsername('chi12345')).toEqual({});
  });
});

describe('mergeServerDetails', () => {
  it('lets server messages win over local ones', () => {
    const merged = mergeServerDetails({ 'parent.email': 'local' }, [
      { field: 'parent.email', message: 'server' },
      { field: 'child.age', message: 'too old' },
    ]);
    expect(merged['parent.email']).toBe('server');
    expect(merged['child.age']).toBe('too old');
  });

  it('keeps local errors when the server sends none', () => {
    expect(mergeServerDetails({ a: 'b' }, undefined)).toEqual({ a: 'b' });
  });
});
