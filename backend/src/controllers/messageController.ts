import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as chat from '../repos/messageRepo';

/** GET /api/messages/order/:orderId — the 3-way buyer/seller/rider thread. */
export const getOrderThread = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const conversationId = await chat.getOrCreateOrderThread(req.params.orderId);
    if (!(await chat.isParticipant(conversationId, req.user.id))) {
      res.status(403).json({ error: 'You are not part of this order.' }); return;
    }
    const messages = await chat.getMessages(conversationId);
    await chat.markThreadRead(conversationId, req.user.id);
    res.json({ conversationId, messages: messages.map(chat.publicMessage) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/messages/order/:orderId */
export const sendOrderMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { body, attachmentUrl } = req.body;
    const conversationId = await chat.getOrCreateOrderThread(req.params.orderId);
    const message = await chat.sendMessage(conversationId, req.user.id, body, attachmentUrl);
    res.status(201).json({ message: chat.publicMessage(message) });
  } catch (err: any) {
    const code = /not part of/i.test(err.message) ? 403 : 400;
    res.status(code).json({ error: err.message });
  }
};

/** GET /api/messages — my inbox. */
export const listConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({ conversations: await chat.listConversations(req.user.id) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** GET /api/messages/:conversationId */
export const getMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.conversationId;
    if (!(await chat.isParticipant(id, req.user.id))) {
      res.status(403).json({ error: 'You are not part of this conversation.' }); return;
    }
    const messages = await chat.getMessages(id);
    await chat.markThreadRead(id, req.user.id);
    res.json({ messages: messages.map(chat.publicMessage) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/messages/:conversationId */
export const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const message = await chat.sendMessage(
      req.params.conversationId, req.user.id, req.body.body, req.body.attachmentUrl);
    res.status(201).json({ message: chat.publicMessage(message) });
  } catch (err: any) {
    const code = /not part of/i.test(err.message) ? 403 : 400;
    res.status(code).json({ error: err.message });
  }
};

export const startConversation = sendMessage;
