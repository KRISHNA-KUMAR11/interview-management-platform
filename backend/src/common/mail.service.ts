import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { interviewNotice, InterviewNotice } from './interview-notice';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    this.from =
      this.configService.get<string>('SMTP_FROM') ?? 'interviews@localhost';
    this.transport = host
      ? nodemailer.createTransport({
          host,
          port: Number(this.configService.get<string>('SMTP_PORT') ?? 1025),
          secure: false,
        })
      : null;
  }

  async sendInterviewEmail(input: {
    to: string;
    candidateName: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    kind: InterviewNotice['kind'];
    liveToken?: string | null;
    technicalToken?: string | null;
  }) {
    if (!this.transport || !input.to) return;

    const links: string[] = [];
    if (input.liveToken) {
      links.push(`Live interview: ${this.frontendUrl}/join/${input.liveToken}`);
    }
    if (input.technicalToken) {
      links.push(
        `Technical assessment: ${this.frontendUrl}/tech-join/${input.technicalToken}`,
      );
    }

    const notice = interviewNotice({
      kind: input.kind,
      candidateName: input.candidateName,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      links,
    });

    try {
      await this.transport.sendMail({
        from: this.from,
        to: input.to,
        subject: notice.subject,
        text: notice.text,
      });
    } catch (error) {
      this.logger.warn(
        `Interview email was not sent: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
