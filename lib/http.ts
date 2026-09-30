import { ZodError, type ZodType } from "zod";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

/** Build a JSON `Response`. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/** Uniform error payload: `{ error: { message, issues? } }`. */
export function apiError(
  message: string,
  status: number,
  issues?: unknown,
): Response {
  return json({ error: issues ? { message, issues } : { message } }, status);
}

export interface Parsed<T> {
  ok: boolean;
  data?: T;
  response?: Response;
}

/**
 * Parse and validate a JSON request body.
 *
 * Returns a discriminated result instead of throwing so that handlers stay
 * linear and always answer with a 400 for malformed input.
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text.trim() === "" ? {} : JSON.parse(text);
  } catch {
    return { ok: false, response: apiError("Request body must be valid JSON", 400) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: apiError(
        "Validation failed",
        400,
        result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      ),
    };
  }
  return { ok: true, data: result.data };
}

interface RouteContext<P> {
  params: Promise<P>;
}

type Handler<A extends unknown[]> = (
  request: Request,
  ...args: A
) => Promise<Response>;

/**
 * Wrap a route handler so that unexpected failures become 500 responses and
 * validation failures from inline `schema.parse` calls become 400 responses.
 */
export function route<A extends unknown[]>(handler: Handler<A>): Handler<A> {
  return async (request: Request, ...args: A): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      if (error instanceof ZodError) {
        return apiError(
          "Validation failed",
          400,
          error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        );
      }
      console.error("[api] unhandled error", error);
      return apiError("Internal server error", 500);
    }
  };
}

/** Await the `params` promise that Next.js provides for dynamic segments. */
export function readParams<P extends Record<string, string>>(
  context: RouteContext<P>,
): Promise<P> {
  return context.params;
}
