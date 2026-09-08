import { Router, type IRouter } from "express";
import healthRouter from "./health";
import subscriptionsRouter from "./subscriptions";
import authRouter from "./auth";
import hookRouter from "./hook";
import apkRouter from "./apk";
import osintRouter from "./osint";
import firebasesRouter from "./firebases";
import configRouter from "./config";
import telegramRouter from "./telegram";
import toolRouter from "./tool";
import pamRouter from "./pam";
import devicesRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(subscriptionsRouter);
router.use(hookRouter);
router.use(apkRouter);
router.use(osintRouter);
router.use(firebasesRouter);
router.use(configRouter);
router.use(telegramRouter);
router.use(toolRouter);
router.use(pamRouter);
router.use(devicesRouter);

export default router;
