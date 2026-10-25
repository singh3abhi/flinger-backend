import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '@/config/config.module';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outgoing email behind an interface so the vendor can change (SMTP/Mailpit locally, Amazon SES
 * later) without touching business code. Tests replace it with a fake that records messages.
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly logger = new Logger(SmtpMailProvider.name);
  private readonly transporter: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.transporter = createTransport({
      url: config.MAIL_SMTP_URL,
      connectionTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.config.MAIL_FROM, ...message });
    // Never log the recipient or body: they can contain a sign-in code.
    this.logger.log(`Email sent: ${message.subject}`);
  }
}

@Global()
@Module({
  providers: [{ provide: MAIL_PROVIDER, useClass: SmtpMailProvider }],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
