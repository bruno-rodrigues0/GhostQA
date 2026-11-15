import { describe, expect, it, vi } from "vitest";
import { navigateWithDnsRetry } from "../../src/lib/navigation-retry";

describe("navigateWithDnsRetry", () => {
  it("retries DNS resolution errors and returns the successful navigation", async () => {
    const navigate = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error("page.goto: net::ERR_NAME_NOT_RESOLVED"),
      )
      .mockResolvedValueOnce("loaded");
    const onFailure = vi.fn();

    await expect(
      navigateWithDnsRetry(
        "https://br.shein.com/",
        navigate,
        onFailure,
      ),
    ).resolves.toBe("loaded");

    expect(navigate).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ message: expect.stringContaining("ERR_NAME_NOT_RESOLVED") }),
      true,
    );
  });

  it("stops after three DNS failures with a helpful error", async () => {
    const navigate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
    const onFailure = vi.fn();

    await expect(
      navigateWithDnsRetry("https://br.shein.com/", navigate, onFailure),
    ).rejects.toThrow(
      "Não foi possível resolver o domínio br.shein.com após 3 tentativas.",
    );

    expect(navigate).toHaveBeenCalledTimes(3);
    expect(onFailure).toHaveBeenLastCalledWith(
      3,
      expect.any(Error),
      false,
    );
  });

  it("does not retry unrelated navigation errors", async () => {
    const failure = new Error("net::ERR_CERT_AUTHORITY_INVALID");
    const navigate = vi.fn<() => Promise<void>>().mockRejectedValue(failure);
    const onFailure = vi.fn();

    await expect(
      navigateWithDnsRetry("https://br.shein.com/", navigate, onFailure),
    ).rejects.toBe(failure);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });
});
