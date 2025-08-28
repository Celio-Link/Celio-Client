import { LinkStatus, CommandType } from '../services/linkdevice.service';

export enum ErrorType {
  ClientNotFound = 'client-not-found',
  ClientAlreadyInSession = 'client-already-in-session',
}

export type JoinMessage = {
  type: 'sessionJoin';
  id: string;
};

export type SessionCreationMessage = {
  type: 'sessionCreate';
};

export type SessionJoinedMessage = {
  type: 'joinedSession';
  sessionId: string;
};

export type SessionPartnerReady = {
  type: 'partnerReady';
}

export type ErrorMessage = {
  type: 'error';
  errorType: ErrorType;
}

export type StatusMessage = {
  type: 'status';
  statusType: LinkStatus;
};

export type CommandMessage = {
  type: 'command';
  commandType: CommandType;
};
