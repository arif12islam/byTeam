import { describe, expect, it } from "vitest";

import { buildHandshakeConfig, ERROR_DELAY_SECONDS, POLL_DELAY_SECONDS, readSerial } from "@/lib/adms/handshake";

describe("readSerial", () => {
  it("accepts a normal serial number and trims it", () => {
    expect(readSerial("CJDE194960123")).toBe("CJDE194960123");
    expect(readSerial(" CJDE194960123 ")).toBe("CJDE194960123");
  });

  it("is null when missing", () => {
    expect(readSerial(null)).toBeNull();
    expect(readSerial("")).toBeNull();
  });

  it("is null for anything that is not shaped like a serial number", () => {
    for (const bad of ["abc", "SN WITH SPACE", "SN;DROP TABLE", "a\nb\nc\nd", "<script>1</script>", "x".repeat(65)]) {
      expect(readSerial(bad), bad).toBeNull();
    }
  });
});

describe("buildHandshakeConfig", () => {
  const config = buildHandshakeConfig("CJDE194960123");
  const lines = config.split("\n");

  it("starts by naming the device and ends with a newline", () => {
    expect(lines[0]).toBe("GET OPTION FROM: CJDE194960123");
    expect(config.endsWith("\n")).toBe(true);
  });

  it("asks for punches in real time and polling at the set delay", () => {
    expect(lines).toContain("Realtime=1");
    expect(lines).toContain(`Delay=${POLL_DELAY_SECONDS}`);
    expect(lines).toContain(`ErrorDelay=${ERROR_DELAY_SECONDS}`);
    expect(POLL_DELAY_SECONDS).toBeGreaterThanOrEqual(30);
    expect(POLL_DELAY_SECONDS).toBeLessThanOrEqual(60);
  });

  it("asks only for attendance and operation logs, and sends no encryption", () => {
    expect(lines).toContain("TransFlag=TransData AttLog\tOpLog");
    expect(lines).toContain("Encrypt=0");
  });

  it("asks for everything held, relying on dedup for repeats", () => {
    expect(lines).toContain("ATTLOGStamp=None");
  });

  it("has one Key=Value per line after the first", () => {
    for (const line of lines.slice(1, -1)) expect(line).toMatch(/^[A-Za-z]+=/);
  });
});
