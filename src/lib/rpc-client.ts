// src/lib/rpc-client.ts
import { JsonRpcClient } from 'json-rpc-client';

// Type definitions for your RPC methods
export interface RpcMethods {
  // Example method signatures - replace with your actual RPC methods
  'user.get': (userId: string) => Promise<User>;
  'user.create': (userData: CreateUserRequest) => Promise<User>;
  'user.list': (filters?: UserFilters) => Promise<User[]>;
  'task.complete': (taskId: string) => Promise<void>;
}

// Domain types
export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface CreateUserRequest {
  email: string;
  name: string;
}

export interface UserFilters {
  limit?: number;
  offset?: number;
  search?: string;
}

// Create typed client instance
const RPC_URL = 'http://127.0.0.1:8080';

export const rpcClient = new JsonRpcClient<RpcMethods>({
  url: RPC_URL,
  // Optional: Add headers if needed
  headers: {
    'Content-Type': 'application/json',
  },
});

// Type-safe wrapper functions (optional but recommended)
export const rpc = {
  user: {
    get: (userId: string) => rpcClient.call('user.get', userId),
    create: (userData: CreateUserRequest) => rpcClient.call('user.create', userData),
    list: (filters?: UserFilters) => rpcClient.call('user.list', filters),
  },
  task: {
    complete: (taskId: string) => rpcClient.call('task.complete', taskId),
  },
};
