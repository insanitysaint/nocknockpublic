// Which workspace the person is looking at, when they belong to more than one (their own plus a team they joined).
export const getOrg = (): string | null => { try { return localStorage.getItem('ea_org') } catch { return null } }
export const setOrg = (id: string) => { try { localStorage.setItem('ea_org', id) } catch { /* private window */ } }
