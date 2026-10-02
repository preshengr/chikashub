import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from '../auth/dto/auth.dto';
import { ErrorCode } from './api-error';
import { flattenValidationErrors, validationExceptionFactory } from './validation';

describe('flattenValidationErrors', () => {
  it('returns an empty list for no errors', () => {
    expect(flattenValidationErrors([])).toEqual([]);
  });

  it('flattens nested DTO trees into dotted field paths', async () => {
    const dto = plainToInstance(RegisterDto, {
      parent: { firstName: 'Ada', lastName: 'Lovelace', relationship: 'mother', email: 'nope' },
      child: { firstName: 'Chika', age: 99, grade: 'grade_1' },
      preferences: { learningGoals: ['math'], readingLevel: 'early_reader', gameplayStyle: 'story' },
      consent: {
        consentData: true,
        termsConsent: true,
        signatureFullName: 'Ada Lovelace',
        signatureDate: '2026-10-01',
      },
    });
    const errors = await validate(dto);
    const flat = flattenValidationErrors(errors);
    const fields = flat.map((f) => f.field);
    expect(fields).toContain('parent.email');
    expect(fields).toContain('child.age');
    expect(flat.find((f) => f.field === 'child.age')?.message).toBe('Age must be between 4 and 12');
  });

  it('emits at most one message per field', () => {
    const errors = [
      {
        property: 'age',
        constraints: { min: 'too small', max: 'too big' },
        children: [],
      },
      {
        property: 'child',
        children: [
          { property: 'age', constraints: { min: 'nope' }, children: [] },
        ],
      },
    ] as never;
    const flat = flattenValidationErrors(errors as never);
    expect(flat).toEqual([
      { field: 'age', message: 'too small' },
      { field: 'child.age', message: 'nope' },
    ]);
  });
});

describe('validationExceptionFactory', () => {
  it('builds an ApiException carrying the first message and every detail', () => {
    const errors = [
      {
        property: 'parent',
        children: [
          { property: 'email', constraints: { isEmail: 'Please enter a valid email address' }, children: [] },
          { property: 'firstName', constraints: { matches: 'Names may only contain letters' }, children: [] },
        ],
      },
    ] as never;

    const exception = validationExceptionFactory(errors as never);
    expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please enter a valid email address',
        details: [
          { field: 'parent.email', message: 'Please enter a valid email address' },
          { field: 'parent.firstName', message: 'Names may only contain letters' },
        ],
      },
    });
  });

  it('falls back to a generic message when there are no details', () => {
    const exception = validationExceptionFactory([] as never);
    expect(exception.getResponse()).toMatchObject({
      error: { message: 'Please correct the highlighted fields.' },
    });
  });
});
