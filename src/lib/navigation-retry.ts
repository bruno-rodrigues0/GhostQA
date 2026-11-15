const MAX_DNS_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 500;

function isNameResolutionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /ERR_NAME_NOT_RESOLVED/i.test(error.message)
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function navigateWithDnsRetry<T>(
  url: string,
  navigate: () => Promise<T>,
  onFailure: (attempt: number, error: unknown, willRetry: boolean) => void,
): Promise<T> {
  const attemptNavigation = async (attempt: number): Promise<T> => {
    try {
      return await navigate();
    } catch (error) {
      if (!isNameResolutionError(error)) {
        throw error;
      }

      const willRetry = attempt < MAX_DNS_ATTEMPTS;
      onFailure(attempt, error, willRetry);
      if (!willRetry) {
        const hostname = new URL(url).hostname;
        throw new Error(
          `Não foi possível resolver o domínio ${hostname} após ${MAX_DNS_ATTEMPTS} tentativas. Verifique a conexão DNS do ambiente e tente repetir a auditoria.`,
          { cause: error },
        );
      }

      await wait(INITIAL_RETRY_DELAY_MS * attempt);
      return attemptNavigation(attempt + 1);
    }
  };

  return attemptNavigation(1);
}
