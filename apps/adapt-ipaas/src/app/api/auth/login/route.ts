import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'super-secret-fallback-key-replace-me-in-production');

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const trimmedIdentifier = typeof email === 'string' ? email.trim() : '';
    const cleanLower = trimmedIdentifier.toLowerCase();

    // Prototype presentation test administrator credentials
    if (cleanLower === 'admin-test-001' || cleanLower.startsWith('admin-test-001@')) {
      if (password !== 'admin') {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      const mockAdmin = {
        id: 'admin-test-001',
        username: 'admin-test-001',
        email: cleanLower.includes('@') ? cleanLower : 'admin-test-001@wah4pce.gov.ph',
        name: 'WAH Administrator',
      };

      const token = await new SignJWT({ id: mockAdmin.id, username: mockAdmin.username, email: mockAdmin.email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(JWT_SECRET);

      const response = NextResponse.json({ user: mockAdmin }, { status: 200 });

      response.cookies.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    }

    // Find the user by email (or username, we can allow both)
    const { data: user } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .or(`email.eq.${email},username.eq.${email}`)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Generate JWT
    const token = await new SignJWT({ id: user.id, username: user.username, email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    const response = NextResponse.json({ user: { id: user.id, username: user.username, email: user.email, name: user.name } }, { status: 200 });
    
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
