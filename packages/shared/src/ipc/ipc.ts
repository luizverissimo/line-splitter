import '../zod-locale';
import { z } from 'zod';
import { AppError, appErrorSchema, describeZodError } from './errors';

export type ChannelDef = { input: z.ZodType; output: z.ZodType };
export type ChannelMap = Record<string, ChannelDef>;
export type EventMap = Record<string, z.ZodType>;

export type InputOf<M extends ChannelMap, C extends keyof M> = z.input<M[C]['input']>;
export type ArgsOf<M extends ChannelMap, C extends keyof M> = z.output<M[C]['input']>;
export type OutputOf<M extends ChannelMap, C extends keyof M> = z.output<M[C]['output']>;
export type PayloadOf<E extends EventMap, K extends keyof E> = z.output<E[K]>;

/** Envelope trafegado pelo IPC: o Electron perde os campos de erros rejeitados, então o erro vai como dado. */
export const ipcResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: appErrorSchema }),
]);
export type IpcResult = z.infer<typeof ipcResultSchema>;

/** Ponte mínima que o preload expõe: envia um canal e devolve o envelope cru. */
export type IpcTransport = (channel: string, payload: unknown) => Promise<unknown>;

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  // ZodError aqui veio de dentro do handler (dado interno inválido), não da entrada do renderer.
  if (err instanceof z.ZodError)
    return new AppError('INTERNAL', 'Dado interno inválido.', describeZodError(err));
  const message = err instanceof Error ? err.message : String(err);
  return new AppError('INTERNAL', 'Erro interno inesperado.', message);
}

/** Cria os helpers tipados de IPC para um contrato (canais + eventos). */
export function createIpc<M extends ChannelMap, E extends EventMap>(channels: M, events: E) {
  type Channel = keyof M & string;
  type Event = keyof E & string;

  /**
   * Lado do processo principal: valida a entrada, executa, valida a saída
   * e devolve sempre um envelope serializável.
   */
  function defineHandler<C extends Channel>(
    channel: C,
    impl: (args: ArgsOf<M, C>) => Promise<OutputOf<M, C>> | OutputOf<M, C>,
  ): (raw: unknown) => Promise<IpcResult> {
    const def = channels[channel];
    if (!def) throw new Error(`Canal IPC desconhecido: ${channel}`);
    return async (raw) => {
      const parsed = def.input.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: new AppError('VALIDATION', describeZodError(parsed.error)).toJSON() };
      }
      try {
        const result = await impl(parsed.data as ArgsOf<M, C>);
        const checked = def.output.safeParse(result);
        if (!checked.success) {
          return {
            ok: false,
            error: new AppError(
              'INVALID_RESPONSE',
              `Resposta inválida do canal ${channel}.`,
              describeZodError(checked.error),
            ).toJSON(),
          };
        }
        return { ok: true, data: checked.data };
      } catch (err) {
        return { ok: false, error: toAppError(err).toJSON() };
      }
    };
  }

  /** Lado do renderer: valida antes de enviar e valida o que voltou; lança AppError em falha. */
  async function invoke<C extends Channel>(
    transport: IpcTransport,
    channel: C,
    input: InputOf<M, C>,
  ): Promise<OutputOf<M, C>> {
    const def = channels[channel];
    if (!def) throw new AppError('VALIDATION', `Canal IPC desconhecido: ${channel}`);
    const parsedInput = def.input.safeParse(input);
    if (!parsedInput.success) throw new AppError('VALIDATION', describeZodError(parsedInput.error));
    const raw = await transport(channel, parsedInput.data);
    const envelope = ipcResultSchema.safeParse(raw);
    if (!envelope.success) {
      throw new AppError(
        'INVALID_RESPONSE',
        `Resposta malformada do canal ${channel}.`,
        describeZodError(envelope.error),
      );
    }
    if (!envelope.data.ok) throw AppError.from(envelope.data.error);
    const data = def.output.safeParse(envelope.data.data);
    if (!data.success) {
      throw new AppError(
        'INVALID_RESPONSE',
        `Resposta inválida do canal ${channel}.`,
        describeZodError(data.error),
      );
    }
    return data.data as OutputOf<M, C>;
  }

  /** Valida um evento main → renderer antes de enviar (lança se o payload não bater). */
  function encodeEvent<K extends Event>(event: K, payload: PayloadOf<E, K>): PayloadOf<E, K> {
    const schema = events[event];
    if (!schema) throw new Error(`Evento IPC desconhecido: ${event}`);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(
        'INVALID_RESPONSE',
        `Evento ${event} com dados inválidos.`,
        describeZodError(parsed.error),
      );
    }
    return parsed.data as PayloadOf<E, K>;
  }

  /** Valida um evento recebido no renderer; devolve null se não bater com o schema. */
  function decodeEvent<K extends Event>(event: K, raw: unknown): PayloadOf<E, K> | null {
    const schema = events[event];
    if (!schema) return null;
    const parsed = schema.safeParse(raw);
    return parsed.success ? (parsed.data as PayloadOf<E, K>) : null;
  }

  const isChannel = (name: string): name is Channel => Object.hasOwn(channels, name);
  const isEvent = (name: string): name is Event => Object.hasOwn(events, name);

  return { channels, events, defineHandler, invoke, encodeEvent, decodeEvent, isChannel, isEvent };
}
