import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const RELATIONSHIPS = ['mother', 'father', 'legal_guardian', 'other'] as const;
export const GRADES = [
  'pre_k',
  'kindergarten',
  'grade_1',
  'grade_2',
  'grade_3',
  'grade_4',
  'grade_5',
] as const;
export const LEARNING_GOAL_VALUES = ['math', 'reading', 'science', 'creativity', 'coding'] as const;
export const READING_LEVEL_VALUES = ['pre_reader', 'early_reader', 'independent_reader'] as const;
export const GAMEPLAY_STYLE_VALUES = ['story', 'action', 'relaxed'] as const;

const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ'’\- ]+$/;
const NAME_MESSAGE = 'Names may only contain letters, spaces, hyphens and apostrophes';
const PHONE_PATTERN = /^\+?[0-9\s().-]{7,20}$/;
const PHONE_MESSAGE = 'Phone number must be 7-20 characters (digits, spaces, +, -, ( ))';

export class ParentDetailsDto {
  @IsString({ message: 'Parent first name is required' })
  @IsNotEmpty({ message: 'Parent first name is required' })
  @MaxLength(60)
  @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  firstName!: string;

  @IsString({ message: 'Parent last name is required' })
  @IsNotEmpty({ message: 'Parent last name is required' })
  @MaxLength(60)
  @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  lastName!: string;

  @IsIn(RELATIONSHIPS, { message: 'Relationship must be Mother, Father, Legal Guardian or Other' })
  relationship!: (typeof RELATIONSHIPS)[number];

  @IsEmail({}, { message: 'Please enter a valid email address' })
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;
}

export class ChildDetailsDto {
  @IsString({ message: "Child's first name is required" })
  @IsNotEmpty({ message: "Child's first name is required" })
  @MaxLength(60)
  @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  firstName!: string;

  @Type(() => Number)
  @IsIn([4, 5, 6, 7, 8, 9, 10, 11, 12], { message: 'Age must be between 4 and 12' })
  @Min(4, { message: 'Age must be between 4 and 12' })
  @Max(12, { message: 'Age must be between 4 and 12' })
  age!: number;

  @IsIn(GRADES, { message: 'Please select a valid grade level' })
  grade!: (typeof GRADES)[number];
}

export class PreferencesDto {
  @IsArray({ message: 'Please select at least one learning goal' })
  @ArrayMinSize(1, { message: 'Please select at least one learning goal' })
  @ArrayMaxSize(2, { message: 'You can select up to 2 primary learning goals' })
  @IsIn(LEARNING_GOAL_VALUES, { each: true, message: 'Unknown learning goal selected' })
  learningGoals!: (typeof LEARNING_GOAL_VALUES)[number][];

  @IsIn(READING_LEVEL_VALUES, { message: 'Please select a reading level' })
  readingLevel!: (typeof READING_LEVEL_VALUES)[number];

  @IsIn(GAMEPLAY_STYLE_VALUES, { message: 'Please select a preferred gameplay style' })
  gameplayStyle!: (typeof GAMEPLAY_STYLE_VALUES)[number];
}

export class ConsentDto {
  @Equals(true, { message: 'COPPA consent checkbox must be ticked' })
  consentData!: boolean;

  @Equals(true, { message: 'You must agree to the Terms of Service' })
  termsConsent!: boolean;

  @IsString({ message: 'Electronic signature (full name) is required' })
  @IsNotEmpty({ message: 'Electronic signature (full name) is required' })
  @MinLength(3, { message: 'Please type your full name as the electronic signature' })
  @MaxLength(120)
  @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  signatureFullName!: string;

  @IsISO8601({}, { message: 'Signature date must be a valid date' })
  signatureDate!: string;
}

export class RegisterDto {
  @IsDefined({ message: 'Parent/guardian details are required' })
  @ValidateNested()
  @Type(() => ParentDetailsDto)
  parent!: ParentDetailsDto;

  @IsDefined({ message: 'Child details are required' })
  @ValidateNested()
  @Type(() => ChildDetailsDto)
  child!: ChildDetailsDto;

  @IsDefined({ message: 'Game preferences are required' })
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences!: PreferencesDto;

  @IsDefined({ message: 'Consent section is required' })
  @ValidateNested()
  @Type(() => ConsentDto)
  consent!: ConsentDto;
}

export class ConfirmRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @IsBoolean({ message: 'accept must be true or false' })
  accept!: boolean;
}

export class LoginDto {
  @IsString({ message: 'Username is required' })
  @IsNotEmpty({ message: 'Username is required' })
  @MaxLength(64)
  username!: string;
}

export class DenyRegistrationDto {
  @IsString({ message: 'Username is required' })
  @IsNotEmpty({ message: 'Username is required' })
  @MaxLength(64)
  username!: string;
}
