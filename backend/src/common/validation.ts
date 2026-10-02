import type { ValidationError } from 'class-validator';
import { ApiException } from './api-error';

export interface ValidationDetail {
  field: string;
  message: string;
}

/**
 * Recursively flatten class-validator's error tree (including nested DTOs
 * such as RegisterDto.parent.firstName) into { field, message } pairs.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationDetail[] {
  const out: ValidationDetail[] = [];
  const seen = new Set<string>();
  const visit = (nodes: ValidationError[], path: string): void => {
    for (const error of nodes) {
      const current = path ? `${path}.${error.property}` : error.property;
      const constraints = error.constraints ?? {};
      for (const message of Object.values(constraints)) {
        // One message per field keeps inline form errors unambiguous.
        if (seen.has(current)) continue;
        seen.add(current);
        out.push({ field: current, message });
      }
      if (error.children && error.children.length > 0) {
        visit(error.children, current);
      }
    }
  };
  visit(errors, parentPath);
  return out;
}

/**
 * Turns class-validator errors into a single ApiException carrying:
 *  - a human-readable message (the first problem, for inline banners)
 *  - `details` with every { field, message } so the form can highlight inputs
 */
export function validationExceptionFactory(errors: ValidationError[]): ApiException {
  const details = flattenValidationErrors(errors);
  const message = details[0]?.message ?? 'Please correct the highlighted fields.';
  return ApiException.validation(message, details);
}
