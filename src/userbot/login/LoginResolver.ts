import { createLogger } from '../../utils/logger';

const logger = createLogger('LoginResolver');

interface PhoneCodeHandler {
  isCodeViaApp?: boolean;
}

export class LoginResolver {
  private phoneNumberResolver: ((phone: string) => void) | null = null;
  private phoneCodeResolver: ((code: string) => void) | null = null;
  private passwordResolver: ((password: string) => void) | null = null;
  
  private currentCode: string = '';
  private userId: number;

  constructor(userId: number, private phoneNumber?: string) {
    this.userId = userId;
  }

  phoneNumberCallback = async (): Promise<string> => {
    if (this.phoneNumber) {
      logger.info({ userId: this.userId }, 'Using provided phone number');
      return this.phoneNumber;
    }

    logger.info({ userId: this.userId }, 'Waiting for phone number');
    return new Promise((resolve) => {
      this.phoneNumberResolver = resolve;
    });
  };

  phoneCodeCallback = async (handler?: PhoneCodeHandler): Promise<string> => {
    const isApp = handler?.isCodeViaApp;
    logger.info({ userId: this.userId, isApp }, 'Waiting for phone code');
    
    return new Promise((resolve) => {
      this.phoneCodeResolver = resolve;
    });
  };

  passwordCallback = async (hint?: string): Promise<string> => {
    logger.info({ userId: this.userId, hint }, 'Waiting for 2FA password');
    
    return new Promise((resolve) => {
      this.passwordResolver = resolve;
    });
  };

  resolvePhoneNumber(phone: string): void {
    if (this.phoneNumberResolver) {
      logger.info({ userId: this.userId }, 'Phone number resolved');
      this.phoneNumberResolver(phone);
      this.phoneNumberResolver = null;
    }
  }

  addCodeDigit(digit: string): void {
    if (digit === 'backspace') {
      this.currentCode = this.currentCode.slice(0, -1);
    } else if (digit === 'submit') {
      this.submitCode();
    } else if (this.currentCode.length < 6) {
      this.currentCode += digit;
    }
    
    logger.debug({ userId: this.userId, codeLength: this.currentCode.length }, 'Code updated');
  }

  submitCode(): void {
    if (this.phoneCodeResolver && this.currentCode.length > 0) {
      logger.info({ userId: this.userId }, 'Code submitted');
      this.phoneCodeResolver(this.currentCode);
      this.phoneCodeResolver = null;
      this.currentCode = '';
    }
  }

  getCurrentCode(): string {
    return this.currentCode;
  }

  resolvePassword(password: string): void {
    if (this.passwordResolver) {
      logger.info({ userId: this.userId }, 'Password resolved');
      this.passwordResolver(password);
      this.passwordResolver = null;
    }
  }

  cleanup(): void {
    this.phoneNumberResolver = null;
    this.phoneCodeResolver = null;
    this.passwordResolver = null;
    this.currentCode = '';
    logger.debug({ userId: this.userId }, 'LoginResolver cleaned up');
  }
}
