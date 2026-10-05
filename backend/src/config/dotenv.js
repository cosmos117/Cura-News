/**
 * Centralized dotenv bootstrap.
 *
 * This module MUST be imported before any module that reads process.env at
 * evaluation time (config/env.js in particular). ES module imports are hoisted
 * and all dependencies of an entry module are evaluated before the entry
 * module's own body, so calling dotenv.config() inside server.js is too late.
 */

import dotenv from "dotenv";

dotenv.config();

export default dotenv;