import { Channel, NewMessage } from './types.js';
import { formatLocalTime } from './timezone.js';

export function escapeXml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMessages(
  messages: NewMessage[],
  timezone: string,
  channel?: Channel,
  contextMessages?: NewMessage[],
): string {
  const channelAttr = channel?.formattingInstructions
    ? ` channel="${escapeXml(channel.name)}"`
    : '';
  const header = `<context timezone="${escapeXml(timezone)}"${channelAttr} />\n`;

  const formattingBlock = channel?.formattingInstructions
    ? `<channel_formatting>\n${channel.formattingInstructions}\n</channel_formatting>\n`
    : '';

  let contextBlock = '';
  if (contextMessages && contextMessages.length > 0) {
    const contextLines = contextMessages.map((m) => {
      const displayTime = formatLocalTime(m.timestamp, timezone);
      return `<message sender="${escapeXml(m.sender_name)}" time="${escapeXml(displayTime)}">${escapeXml(m.content)}</message>`;
    });
    contextBlock = `<conversation_history>\n${contextLines.join('\n')}\n</conversation_history>\n`;
  }

  const lines = messages.map((m) => {
    const displayTime = formatLocalTime(m.timestamp, timezone);
    return `<message sender="${escapeXml(m.sender_name)}" time="${escapeXml(displayTime)}">${escapeXml(m.content)}</message>`;
  });

  return `${header}${formattingBlock}${contextBlock}<messages>\n${lines.join('\n')}\n</messages>`;
}

export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}

export function formatOutbound(rawText: string): string {
  const text = stripInternalTags(rawText);
  if (!text) return '';
  return text;
}

export function routeOutbound(
  channels: Channel[],
  jid: string,
  text: string,
): Promise<void> {
  const channel = channels.find((c) => c.ownsJid(jid) && c.isConnected());
  if (!channel) throw new Error(`No channel for JID: ${jid}`);
  return channel.sendMessage(jid, text);
}

export function findChannel(
  channels: Channel[],
  jid: string,
): Channel | undefined {
  return channels.find((c) => c.ownsJid(jid) && c.isConnected());
}
