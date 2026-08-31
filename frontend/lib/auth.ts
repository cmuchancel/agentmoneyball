export const ACCESS_COOKIE = "pitchquery_access";

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function sessionIsValid(value?: string) {
  const expected = process.env.PITCHQUERY_SESSION_TOKEN;
  return Boolean(value && expected && constantTimeEqual(value, expected));
}

export function passwordIsValid(value: string) {
  const expected = process.env.PITCHQUERY_PASSWORD;
  return Boolean(expected && constantTimeEqual(value, expected));
}

export function safeReturnTo(value: string | null | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}
