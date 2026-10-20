import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { connect, type Socket } from 'node:net';
import { createInterface, type Interface } from 'node:readline';
import { connect as connectTls, type TLSSocket } from 'node:tls';
import { renderRegistrationEmail } from '../templates/registration-email.template.js';
import { renderPasswordResetEmail } from '../templates/password-reset-email.template.js';

function encodeMimePart(content: string): string {
  return (
    Buffer.from(content, 'utf8')
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? ''
  );
}

class SmtpConnection {
  private reader: Interface;
  private lines: AsyncIterator<string>;

  constructor(private socket: Socket | TLSSocket) {
    this.reader = createInterface({ input: socket, crlfDelay: Infinity });
    this.lines = this.reader[Symbol.asyncIterator]();
  }

  async read(expected: number): Promise<string> {
    let response = '';
    for (let count = 0; count < 30; count++) {
      const next = await this.lines.next();
      if (next.done) throw new Error(`SMTP connection closed. Last response: ${response.trim()}`);
      response += `${next.value}\n`;
      if (/^\d{3} /.test(next.value)) {
        const code = Number(next.value.slice(0, 3));
        if (code !== expected) {
          throw new Error(
            `SMTP rejected command (expected ${expected}, got ${code}): ${response.trim()}`,
          );
        }
        return response;
      }
    }
    throw new Error('SMTP response was too long');
  }

  async command(value: string, expected: number): Promise<string> {
    this.socket.write(`${value}\r\n`);
    return this.read(expected);
  }

  async startTls(host: string): Promise<void> {
    this.reader.close();
    const secured = connectTls({ socket: this.socket, servername: host, rejectUnauthorized: true });
    await once(secured, 'secureConnect');
    this.socket = secured;
    this.reader = createInterface({ input: secured, crlfDelay: Infinity });
    this.lines = this.reader[Symbol.asyncIterator]();
  }

  close(): void {
    this.reader.close();
    this.socket.destroy();
  }
}

@Injectable()
export class RegistrationMailService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SMTP_HOST') &&
      this.config.get<number>('SMTP_PORT') &&
      this.config.get<string>('SMTP_USER') &&
      this.config.get<string>('SMTP_PASS') &&
      this.config.get<string>('SMTP_FROM'),
    );
  }

  async sendCode(to: string, code: string): Promise<void> {
    return this.send(to, renderRegistrationEmail(code));
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    return this.send(to, renderPasswordResetEmail(code));
  }

  async sendMail(
    to: string,
    template: { subject: string; text: string; html: string },
  ): Promise<void> {
    return this.send(to, template);
  }

  private async send(
    to: string,
    template: { subject: string; text: string; html: string },
  ): Promise<void> {
    if (!this.isConfigured())
      throw new ServiceUnavailableException('REGISTRATION_MAIL_NOT_CONFIGURED');
    const host = this.config.getOrThrow<string>('SMTP_HOST');
    const port = Number(this.config.getOrThrow<number | string>('SMTP_PORT'));
    const user = this.config.getOrThrow<string>('SMTP_USER');
    const password = this.config.getOrThrow<string>('SMTP_PASS').replace(/\s+/g, '');
    const from = this.config.getOrThrow<string>('SMTP_FROM');
    const isImplicitTls = port === 465;
    const socket = isImplicitTls
      ? connectTls({ host, port, servername: host, rejectUnauthorized: true })
      : connect({ host, port });
    socket.setTimeout(15_000, () => socket.destroy(new Error('SMTP timeout')));
    let smtp: SmtpConnection | null = null;
    try {
      await once(socket, isImplicitTls ? 'secureConnect' : 'connect');
      smtp = new SmtpConnection(socket);
      await smtp.read(220);
      const greeting = await smtp.command('EHLO piggyback.local', 250);
      if (!isImplicitTls) {
        if (!greeting.includes('STARTTLS')) throw new Error('SMTP STARTTLS is required');
        await smtp.command('STARTTLS', 220);
        await smtp.startTls(host);
        await smtp.command('EHLO piggyback.local', 250);
      }
      try {
        await smtp.command(
          `AUTH PLAIN ${Buffer.from(`\0${user}\0${password}`).toString('base64')}`,
          235,
        );
      } catch (authErr) {
        try {
          await smtp.command('AUTH LOGIN', 334);
          await smtp.command(Buffer.from(user).toString('base64'), 334);
          await smtp.command(Buffer.from(password).toString('base64'), 235);
        } catch {
          throw authErr;
        }
      }
      await smtp.command(`MAIL FROM:<${from}>`, 250);
      await smtp.command(`RCPT TO:<${to}>`, 250);
      await smtp.command('DATA', 354);
      const boundary = `piggyback-${randomUUID()}`;
      const message = [
        `From: Piggy Back <${from}>`,
        `To: <${to}>`,
        `Subject: =?UTF-8?B?${Buffer.from(template.subject, 'utf8').toString('base64')}?=`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        encodeMimePart(template.text),
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        encodeMimePart(template.html),
        `--${boundary}--`,
      ].join('\r\n');
      await smtp.command(`${message}\r\n.`, 250);
      await smtp.command('QUIT', 221);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(`REGISTRATION_MAIL_SEND_FAILED: ${detail}`, {
        cause: err,
      });
    } finally {
      smtp?.close();
      socket.destroy();
    }
  }
}
