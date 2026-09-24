import { describe, expect, it } from 'vitest'
import {
  avatarUrlFor,
  displayNameFor,
  firstNameFor,
  friendlyAuthError,
  initialsFor,
  linkedProviders,
  readOAuthError,
} from '../src/auth/authHelpers.js'

const googleUser = {
  email: 'ahmad@gmail.com',
  user_metadata: { full_name: 'Ahmad Arsalan', picture: 'https://example.com/g.png' },
  identities: [{ provider: 'google', identity_data: { email: 'ahmad@gmail.com' } }],
}

describe('displayNameFor / firstNameFor', () => {
  it('uses the name Google or GitHub gave us', () => {
    expect(displayNameFor(googleUser)).toBe('Ahmad Arsalan')
    expect(firstNameFor(googleUser)).toBe('Ahmad')
  })

  it('falls back to the GitHub username, then the email', () => {
    expect(displayNameFor({ email: 'x@y.com', user_metadata: { user_name: 'pansoup' } })).toBe('pansoup')
    expect(displayNameFor({ email: 'scar@stonybrook.edu', user_metadata: {} })).toBe('scar')
  })
})

describe('avatarUrlFor', () => {
  it('reads Google "picture" and GitHub "avatar_url"', () => {
    expect(avatarUrlFor(googleUser)).toBe('https://example.com/g.png')
    expect(avatarUrlFor({ user_metadata: { avatar_url: 'https://example.com/gh.png' } })).toBe(
      'https://example.com/gh.png',
    )
  })

  it('returns null when there is no picture', () => {
    expect(avatarUrlFor({ user_metadata: {} })).toBeNull()
    expect(avatarUrlFor(null)).toBeNull()
  })
})

describe('initialsFor', () => {
  it('takes first and last initials', () => {
    expect(initialsFor('Ahmad Arsalan Elham')).toBe('AE')
    expect(initialsFor('ahmad')).toBe('AH')
    expect(initialsFor('')).toBe('?')
  })
})

describe('linkedProviders', () => {
  it('lists which sign-in options belong to this one account', () => {
    expect(linkedProviders(googleUser)).toEqual({ google: 'ahmad@gmail.com', github: null })
  })

  it('shows both once GitHub is connected to the same user', () => {
    const both = {
      ...googleUser,
      identities: [...googleUser.identities, { provider: 'github', identity_data: { email: 'a@school.edu' } }],
    }
    expect(linkedProviders(both)).toEqual({ google: 'ahmad@gmail.com', github: 'a@school.edu' })
  })

  it('handles a user with no identities', () => {
    expect(linkedProviders({})).toEqual({ google: null, github: null })
  })
})

describe('friendlyAuthError', () => {
  it('explains an account that belongs to someone else', () => {
    expect(friendlyAuthError('Identity is already linked to another user')).toMatch(/already used/)
  })

  it('explains a cancelled sign-in', () => {
    expect(friendlyAuthError({ message: 'access_denied' })).toMatch(/cancelled/)
  })

  it('passes unknown messages through', () => {
    expect(friendlyAuthError('Something odd')).toBe('Something odd')
    expect(friendlyAuthError(null)).toMatch(/Something went wrong/)
  })
})

describe('readOAuthError', () => {
  it('finds the error after "?" or "#"', () => {
    expect(readOAuthError('http://localhost:5173/?error=access_denied&error_description=User+denied')).toBe(
      'User denied',
    )
    expect(readOAuthError('http://localhost:5173/#error=server_error&error_description=Oops')).toBe('Oops')
  })

  it('returns null for a normal address', () => {
    expect(readOAuthError('http://localhost:5173/')).toBeNull()
    expect(readOAuthError('http://localhost:5173/#access_token=abc')).toBeNull()
    expect(readOAuthError('not a url')).toBeNull()
  })
})