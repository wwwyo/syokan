import type { z } from "zod";

export type ValidationIssue = {
  path: (string | number)[];
  message: string;
  code: string;
  expected?: string;
};

export function formatValidationError(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => {
    const formatted: ValidationIssue = {
      path: issue.path.map((segment) =>
        typeof segment === "number" ? segment : String(segment),
      ),
      message: issue.message,
      code: issue.code ?? "unknown",
    };
    if (issue.code === "invalid_type") {
      formatted.expected = issue.expected;
    }
    return formatted;
  });
}
