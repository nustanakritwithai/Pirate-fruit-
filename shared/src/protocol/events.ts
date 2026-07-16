export type ServerEventType =
  | 'server:welcome'
  | 'server:announcement'
  | 'session:expired'
  | 'economy:snapshot'
  | 'economy:updated'
  | 'economy:crisis'
  | 'market:updated'
  | 'contract:updated'
  | 'player:state-updated';

export interface ProtocolEnvelope<TPayload> {
  protocolVersion: number;
  sequence: number;
  type: ServerEventType;
  payload: TPayload;
}
