export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue | undefined;
};

export type Throwable = Error | object | JsonValue | undefined;

export function isJsonObject(value: object | null): value is JsonObject {
  return value !== null;
}
