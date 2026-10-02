import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const EVENT_TYPES = ['start', 'level_complete', 'failure', 'game_complete'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export class GameEventDto {
  @IsString({ message: 'gameId is required' })
  @IsNotEmpty({ message: 'gameId is required' })
  @MaxLength(64)
  gameId!: string;

  @IsIn(EVENT_TYPES, { message: 'eventType must be start, level_complete, failure or game_complete' })
  eventType!: EventType;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'level must be a whole number' })
  @Min(0, { message: 'level must be 0 or greater' })
  @Max(1000)
  level?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'score must be a whole number' })
  @Min(0, { message: 'score must be 0 or greater' })
  @Max(10_000_000)
  score?: number;

  @IsOptional()
  @IsObject({ message: 'payload must be an object' })
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601({}, { message: 'clientTimestamp must be an ISO-8601 date' })
  clientTimestamp?: string;
}
