import { describe, expect, it } from 'vitest'
import { buildGoogleAuthUrl, readGoogleCallback, sha256Hex } from '../src/auth/googleSignIn.js'

describe('buildGoogleAuthUrl', () => {
  it('asks Google for an ID token that returns to this site', () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: 'abc.apps.googleusercontent.com',
        redirectUri: 'https://harmonic.example/',
        hashedNonce: 'hashed',
        state: 'xyz',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'abc.apps.googleusercontent.com',
      redirect_uri: 'https://harmonic.example/',
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: 'hashed',
      state: 'xyz',
    })
  })
})

describe('readGoogleCallback', () => {
  it('reads the token and state from the address', () => {
    expect(readGoogleCallback('https://harmonic.example/#state=xyz&id_token=aaa.bbb.ccc&authuser=0')).toEqual({
      idToken: 'aaa.bbb.ccc',
      state: 'xyz',
    })
  })

  it('is null for any other address', () => {
    expect(readGoogleCallback('https://harmonic.example/')).toBeNull()
    expect(readGoogleCallback('https://harmonic.example/#access_token=supabase')).toBeNull()
    expect(readGoogleCallback('https://harmonic.example/#error=access_denied&state=xyz')).toBeNull()
    expect(readGoogleCallback('not an address')).toBeNull()
  })
})

describe('sha256Hex', () => {
  it('hashes the nonce the way Google and Supabase expect', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
