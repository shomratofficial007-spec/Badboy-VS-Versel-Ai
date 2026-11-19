import type { RequestHandler } from "express";
import { authenticatePersonalOwner } from "../../../../functions/api/personalAuth.ts";

/**
 * Protect the optional Express backend with the same single-owner credential
 * contract as the primary Cloudflare Worker. The health route remains public.
 */
export const requirePersonalOwner: RequestHandler = async (req, res, next) => {
  try {
    const authRequest = new Request("https://badboy.local/api/assistant", {
      method: req.method,
      headers: {
        Authorization: req.get("authorization") ?? "",
      },
    });
    const result = await authenticatePersonalOwner(authRequest, {
      BADBOY_OWNER_TOKEN: process.env.BADBOY_OWNER_TOKEN,
    });

    if (!result.ok) {
      const payload = await result.response.json();
      res.status(result.response.status).json(payload);
      return;
    }

    res.locals.ownerId = result.identity.ownerId;
    next();
  } catch (error) {
    next(error);
  }
};
