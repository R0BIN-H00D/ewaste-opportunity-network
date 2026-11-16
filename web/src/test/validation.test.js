import { loginSchema, registerSchema, resetSchema, toRegisterBody } from '../lib/validation';

const base = { role: 'user', name: 'Asha Rao', email: 'ASHA@Test.local', phone: '', organizationName: '', password: 'Passw0rd!x', confirmPassword: 'Passw0rd!x' };
const issues = (schema, value) => {
  const r = schema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('registerSchema', () => {
  it('accepts a valid individual and lower-cases the email', () => {
    const r = registerSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data.email).toBe('asha@test.local');
  });

  it.each([['short1'], ['onlyletters'], ['12345678']])('rejects the weak password %s', (password) => {
    expect(issues(registerSchema, { ...base, password, confirmPassword: password })).toContain('password');
  });

  it('requires matching passwords', () => {
    expect(issues(registerSchema, { ...base, confirmPassword: 'Different1' })).toContain('confirmPassword');
  });

  it('requires an organisation name only for refurbishers and recyclers', () => {
    expect(issues(registerSchema, { ...base, role: 'recycler' })).toContain('organizationName');
    expect(issues(registerSchema, { ...base, role: 'refurbisher' })).toContain('organizationName');
    expect(issues(registerSchema, { ...base, role: 'technician' })).not.toContain('organizationName');
    expect(issues(registerSchema, { ...base, role: 'recycler', organizationName: 'GreenLoop' })).toEqual([]);
  });

  it('validates the optional phone', () => {
    expect(issues(registerSchema, { ...base, phone: 'call me' })).toContain('phone');
    expect(issues(registerSchema, { ...base, phone: '+91 98450 12345' })).toEqual([]);
  });
});

describe('toRegisterBody', () => {
  it('drops the confirmation and empty optional fields', () => {
    expect(toRegisterBody(base)).toEqual({ role: 'user', name: 'Asha Rao', email: 'ASHA@Test.local', password: 'Passw0rd!x' });
  });
  it('adds organizationName only when the role needs it', () => {
    const body = toRegisterBody({ ...base, role: 'recycler', organizationName: ' GreenLoop ', phone: '+91 98450 12345' });
    expect(body).toMatchObject({ role: 'recycler', organizationName: 'GreenLoop', phone: '+91 98450 12345' });
    expect(toRegisterBody({ ...base, role: 'technician', organizationName: 'x' }).organizationName).toBeUndefined();
  });
});

describe('loginSchema / resetSchema', () => {
  it('needs a valid email and a password', () => {
    expect(issues(loginSchema, { email: 'nope', password: '' }).sort()).toEqual(['email', 'password']);
  });
  it('reset needs matching strong passwords', () => {
    expect(issues(resetSchema, { password: 'Passw0rd!x', confirmPassword: 'Passw0rd!y' })).toContain('confirmPassword');
    expect(issues(resetSchema, { password: 'Passw0rd!x', confirmPassword: 'Passw0rd!x' })).toEqual([]);
  });
});
