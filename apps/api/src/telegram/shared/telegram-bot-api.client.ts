import { BadRequestException, Injectable } from '@nestjs/common';

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

export class TelegramApiError extends BadRequestException {
  constructor(message: string, public readonly code?: number) {
    super(message);
  }
}

@Injectable()
export class TelegramBotApiClient {
  private endpoint(token: string, method: string) {
    return `https://api.telegram.org/bot${token}/${method}`;
  }

  private async call<T>(token: string, method: string, payload?: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint(token, method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const data = (await response.json()) as TelegramResponse<T>;
    if (!response.ok || !data.ok || data.result === undefined) {
      const message = data.description || 'Telegram API request failed';
      throw new TelegramApiError(message, data.error_code || response.status);
    }

    return data.result;
  }

  getMe(token: string) {
    return this.call<{ id: number; username?: string; first_name?: string }>(token, 'getMe');
  }

  getWebhookInfo(token: string) {
    return this.call<{ url: string; has_custom_certificate?: boolean; pending_update_count?: number; last_error_message?: string }>(token, 'getWebhookInfo');
  }

  getChat(token: string, chatIdOrUsername: string) {
    return this.call<{ id: number; title?: string; username?: string; type?: string; photo?: { small_file_id?: string; big_file_id?: string } }>(token, 'getChat', { chat_id: chatIdOrUsername });
  }

  getChatMemberCount(token: string, chatIdOrUsername: string) {
    return this.call<number>(token, 'getChatMemberCount', { chat_id: chatIdOrUsername });
  }

  getFile(token: string, fileId: string) {
    return this.call<{ file_path?: string }>(token, 'getFile', { file_id: fileId });
  }

  getChatMember(token: string, chatIdOrUsername: string, userId: string | number) {
    return this.call<{ status: string; can_invite_users?: boolean; can_manage_chat?: boolean; can_post_messages?: boolean }>(token, 'getChatMember', { chat_id: chatIdOrUsername, user_id: userId });
  }

  getChatAdministrators(token: string, chatIdOrUsername: string) {
    return this.call<Array<{ user: { id: number }; status: string; can_invite_users?: boolean; can_manage_chat?: boolean; can_post_messages?: boolean }>>(token, 'getChatAdministrators', { chat_id: chatIdOrUsername });
  }

  createChatInviteLink(token: string, chatIdOrUsername: string, params?: Record<string, unknown>) {
    return this.call<{ invite_link: string; creates_join_request?: boolean; expire_date?: number; member_limit?: number; name?: string }>(token, 'createChatInviteLink', {
      chat_id: chatIdOrUsername,
      ...params,
    });
  }
}
