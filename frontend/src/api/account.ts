import { request, uploadForm } from './client';
import type {
  Account,
  AvatarUploadResponse,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  ProfileResponse,
  RegisterRequest,
  RegisterResponse,
  RenameResponse,
} from '../types';

export function register(body: RegisterRequest): Promise<RegisterResponse> {
  return request<RegisterResponse>('/account/register', body);
}

export function login(body: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/account/login', body);
}

export function changePassword(body: ChangePasswordRequest): Promise<{ message: string }> {
  return request<{ message: string }>('/account/changePassword', body);
}

export function findByID(id: number): Promise<Account> {
  return request<Account>('/account/findByID', { id });
}

export function findByUsername(username: string): Promise<Account> {
  return request<Account>('/account/findByUsername', { username });
}

export function getProfile(account_id: number): Promise<ProfileResponse> {
  return request<ProfileResponse>('/account/getProfile', { account_id });
}

export function logout(): Promise<{ message: string }> {
  return request<{ message: string }>('/account/logout', {});
}

export function rename(new_username: string): Promise<RenameResponse> {
  return request<RenameResponse>('/account/rename', { new_username });
}

export function uploadAvatar(file: File, onProgress?: (percent: number) => void): Promise<AvatarUploadResponse> {
  const form = new FormData();
  form.append('file', file);
  return uploadForm<AvatarUploadResponse>('/account/uploadAvatar', form, onProgress);
}

export function updateProfile(avatar_url: string, bio: string): Promise<{ message: string }> {
  return request<{ message: string }>('/account/updateProfile', { avatar_url, bio });
}
