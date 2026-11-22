// Run with PGLITE_TEST_MODULE pointing to @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_TEST_MODULE).href)
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const sharing = await readFile(new URL('0010_attempt_sharing.sql', migrations), 'utf8')
const anchors = await readFile(new URL('0020_guitar_comment_anchors.sql', migrations), 'utf8')
const canView = sharing.slice(sharing.indexOf('create function public.can_view_attempt('), sharing.indexOf('grant execute on function public.can_view_attempt(uuid) to authenticated;') + 'grant execute on function public.can_view_attempt(uuid) to authenticated;'.length)
const comments = sharing.slice(sharing.indexOf('create table public.attempt_comment ('), sharing.indexOf('grant execute on function public.list_attempt_comments(uuid) to authenticated;') + 'grant execute on function public.list_attempt_comments(uuid) to authenticated;'.length)

test('anchor migration keeps existing comments and enforces shared-run access and valid positions', async () => {
  const db = new PGlite()
  const owner = '00000000-0000-4000-8000-000000000001'
  const friend = '00000000-0000-4000-8000-000000000002'
  const linkViewer = '00000000-0000-4000-8000-000000000003'
  const guitar = '00000000-0000-4000-8000-000000000101'
  const vocal = '00000000-0000-4000-8000-000000000102'
  const identify = async (user) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`)
  const post = (attempt, body, anchor) => db.query(
    'insert into public.attempt_comment (attempt_id, body, anchor_index) values ($1, $2, $3)', [attempt, body, anchor],
  )
  const thread = () => db.query('select body, anchor_index from public.list_attempt_comments($1) order by body', [guitar])

  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to authenticated;
      create table public.profiles (id uuid primary key, display_name text, tag text, avatar_url text);
      create table public.shared_attempt (
        id uuid primary key, user_id uuid, instrument text, verdicts jsonb, link_shared boolean
      );
      create table public.attempt_recipient (attempt_id uuid, recipient_id uuid);
      ${canView}
      ${comments}
      grant select, insert, delete on public.attempt_comment to authenticated;
      insert into auth.users values ('${owner}'), ('${friend}'), ('${linkViewer}');
      insert into public.profiles (id) select id from auth.users;
      insert into public.shared_attempt values
        ('${guitar}', '${owner}', 'guitar', '["hit","miss","skipped",null]', true),
        ('${vocal}', '${owner}', 'voice', '["hit"]', false);
      insert into public.attempt_recipient values ('${guitar}', '${friend}');
      insert into public.attempt_comment (attempt_id, author_id, body) values ('${guitar}', '${owner}', 'General');
      ${anchors}
    `)
    await identify(friend)
    await post(guitar, 'Anchored', 1)
    for (const invalid of [-1, 2, 3, 4]) {
      await assert.rejects(post(guitar, 'Invalid', invalid), { code: '23514' })
    }
    await identify(owner)
    await assert.rejects(post(vocal, 'Invalid', 0), { code: '23514' })
    assert.deepEqual((await thread()).rows, [
      { body: 'Anchored', anchor_index: 1 },
      { body: 'General', anchor_index: null },
    ])
    await identify(linkViewer)
    assert.deepEqual((await thread()).rows, [])
    await assert.rejects(post(guitar, 'Invalid', null), { code: '42501' })
    await assert.rejects(post(guitar, 'Invalid', 0), { code: '23514' })
  } finally {
    await db.close()
  }
})
