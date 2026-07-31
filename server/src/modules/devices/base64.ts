import { BadRequestException } from "@nestjs/common";

const CANONICAL_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function decodeStrictBase64(
  value: string,
  fieldName: string,
  minimumBytes: number,
  maximumBytes: number,
): Buffer {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !CANONICAL_BASE64_PATTERN.test(value)
  ) {
    throw new BadRequestException(`${fieldName} must be canonical base64`);
  }

  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new BadRequestException(`${fieldName} must be canonical base64`);
  }
  if (decoded.length < minimumBytes || decoded.length > maximumBytes) {
    throw new BadRequestException(
      `${fieldName} must decode to ${minimumBytes}-${maximumBytes} bytes`,
    );
  }

  return decoded;
}
