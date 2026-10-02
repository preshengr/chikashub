import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { RegisterDto, LoginDto, ConfirmRegistrationDto } from './auth.dto';

interface ValidPayload {
  parent: Record<string, unknown>;
  child: Record<string, unknown>;
  preferences: Record<string, unknown>;
  consent: Record<string, unknown>;
}

function validPayload(): ValidPayload {
  return {
    parent: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      relationship: 'mother',
      email: 'ada@example.com',
      phone: '555 123 4567',
    },
    child: { firstName: 'Chika', age: 7, grade: 'grade_1' },
    preferences: {
      learningGoals: ['math', 'coding'],
      readingLevel: 'early_reader',
      gameplayStyle: 'story',
    },
    consent: {
      consentData: true,
      termsConsent: true,
      signatureFullName: 'Ada Lovelace',
      signatureDate: '2026-10-01',
    },
  };
}

async function validateRegister(payload: unknown): Promise<ValidationError[]> {
  return validate(plainToInstance(RegisterDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: false,
  });
}

function messages(errors: ValidationError[]): string[] {
  const out: string[] = [];
  const walk = (nodes: ValidationError[]): void => {
    for (const node of nodes) {
      if (node.constraints) out.push(...Object.values(node.constraints));
      if (node.children) walk(node.children);
    }
  };
  walk(errors);
  return out;
}

function hasMessage(errors: ValidationError[], text: string): boolean {
  return messages(errors).some((m) => m.includes(text));
}

describe('RegisterDto validation', () => {
  it('accepts a fully valid payload', async () => {
    const errors = await validateRegister(validPayload());
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing parent section', async () => {
    const payload = validPayload() as unknown as Record<string, unknown>;
    delete payload.parent;
    const errors = await validateRegister(payload);
    expect(messages(errors).length).toBeGreaterThan(0);
  });

  it('rejects an invalid email address', async () => {
    const payload = validPayload();
    payload.parent.email = 'not-an-email';
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'Please enter a valid email address')).toBe(true);
  });

  it('rejects names containing digits or punctuation', async () => {
    const payload = validPayload();
    payload.parent.firstName = 'Ada3!';
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'Names may only contain letters')).toBe(true);
  });

  it.each([3, 13, 15])('rejects age %i', async (age) => {
    const payload = validPayload();
    payload.child.age = age;
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'Age must be between 4 and 12')).toBe(true);
  });

  it.each([4, 7, 12])('accepts age %i', async (age) => {
    const payload = validPayload();
    payload.child.age = age;
    const errors = await validateRegister(payload);
    expect(errors).toHaveLength(0);
  });

  it('coerces a numeric string age', async () => {
    const payload = validPayload();
    payload.child.age = '8' as unknown as number;
    const errors = await validateRegister(payload);
    expect(errors).toHaveLength(0);
  });

  it('accepts every supported grade and rejects an unknown one', async () => {
    const payload = validPayload();
    payload.child.grade = 'grade_5';
    expect(await validateRegister(payload)).toHaveLength(0);

    payload.child.grade = 'year_6';
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'Please select a valid grade level')).toBe(true);
  });

  it('requires between 1 and 2 learning goals', async () => {
    const empty = validPayload();
    empty.preferences.learningGoals = [];
    expect(hasMessage(await validateRegister(empty), 'Please select at least one learning goal')).toBe(true);

    const tooMany = validPayload();
    tooMany.preferences.learningGoals = ['math', 'reading', 'science'];
    expect(hasMessage(await validateRegister(tooMany), 'up to 2 primary learning goals')).toBe(true);

    const ok = validPayload();
    ok.preferences.learningGoals = ['science'];
    expect(await validateRegister(ok)).toHaveLength(0);
  });

  it('rejects an unknown learning goal', async () => {
    const payload = validPayload();
    payload.preferences.learningGoals = ['astronomy'];
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'Unknown learning goal selected')).toBe(true);
  });

  it('requires a reading level and gameplay style', async () => {
    const payload = validPayload();
    payload.preferences.readingLevel = 'fluent';
    payload.preferences.gameplayStyle = 'speedrun';
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'Please select a reading level')).toBe(true);
    expect(hasMessage(errors, 'Please select a preferred gameplay style')).toBe(true);
  });

  it('accepts an omitted phone number but rejects a malformed one', async () => {
    const optional = validPayload();
    delete optional.parent.phone;
    expect(await validateRegister(optional)).toHaveLength(0);

    const bad = validPayload();
    bad.parent.phone = 'call-me';
    const errors = await validateRegister(bad);
    expect(hasMessage(errors, 'Phone number must be 7-20 characters')).toBe(true);
  });

  it('requires both COPPA consent checkboxes to be ticked', async () => {
    const payload = validPayload();
    payload.consent.consentData = false;
    payload.consent.termsConsent = false;
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'COPPA consent checkbox must be ticked')).toBe(true);
    expect(hasMessage(errors, 'You must agree to the Terms of Service')).toBe(true);
  });

  it('requires an electronic signature of at least three characters', async () => {
    const payload = validPayload();
    payload.consent.signatureFullName = 'Al';
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'Please type your full name as the electronic signature')).toBe(true);
  });

  it('rejects an invalid signature date', async () => {
    const payload = validPayload();
    payload.consent.signatureDate = 'yesterday';
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'Signature date must be a valid date')).toBe(true);
  });

  it('rejects an unknown relationship option', async () => {
    const payload = validPayload();
    payload.parent.relationship = 'cousin';
    const errors = await validateRegister(payload);
    expect(hasMessage(errors, 'Relationship must be Mother, Father, Legal Guardian or Other')).toBe(true);
  });

  it('strips unknown top-level properties (whitelist behaviour)', async () => {
    const payload = { ...(validPayload() as unknown as Record<string, unknown>), isAdmin: true };
    const dto = plainToInstance(RegisterDto, payload);
    await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
    expect((dto as unknown as Record<string, unknown>).isAdmin).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>).parent).toBeDefined();
  });
});

describe('LoginDto validation', () => {
  it('accepts a username string', async () => {
    const dto = plainToInstance(LoginDto, { username: 'chi48291' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an empty username', async () => {
    const dto = plainToInstance(LoginDto, { username: '' });
    const errors = await validate(dto);
    expect(hasMessage(errors, 'Username is required')).toBe(true);
  });

  it('rejects a missing username', async () => {
    const dto = plainToInstance(LoginDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('ConfirmRegistrationDto validation', () => {
  it('requires an explicit boolean accept flag', async () => {
    const missing = plainToInstance(ConfirmRegistrationDto, { username: 'chi48291' });
    expect(hasMessage(await validate(missing), 'accept must be true or false')).toBe(true);

    const valid = plainToInstance(ConfirmRegistrationDto, { username: 'chi48291', accept: true });
    expect(await validate(valid)).toHaveLength(0);
  });
});
