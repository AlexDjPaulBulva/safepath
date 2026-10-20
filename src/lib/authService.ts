import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { ref, set, get, onValue, remove } from 'firebase/database';
import { auth, db } from './firebase';

export interface ParentProfile {
  uid: string;
  email: string | null;
  role: 'parent';
  createdAt: number;
}

/**
 * Zaregistruje nového rodiče e-mailem a heslem.
 * Po registraci vytvoří uzel v databázi /users/${user.uid} s profilem rodiče.
 */
export async function registerParent(email: string, password: string): Promise<User> {
  const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = userCredential.user;

  try {
    // Vytvoření uzlu v Realtime Database
    await set(ref(db, `users/${user.uid}`), {
      uid: user.uid,
      email: user.email,
      role: 'parent',
      createdAt: Date.now()
    });
  } catch (dbError) {
    console.warn('Upozornění při ukládání profilu rodiče do databáze:', dbError);
  }

  return user;
}

/**
 * Přihlásí rodiče e-mailem a heslem.
 */
export async function loginParent(email: string, password: string): Promise<User> {
  const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return userCredential.user;
}

/**
 * Odhlásí aktuálně přihlášeného rodiče.
 */
export async function logoutParent(): Promise<void> {
  await signOut(auth);
}

/**
 * Sleduje změny stavu přihlášení uživatele v reálném čase.
 * Vrací funkci pro odhlášení posluchače (unsubscribe).
 */
export function subscribeToAuthChanges(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Uloží spárovaný 6místný kód dítěte trvale pod účet rodiče:
 * /users/${parentUid}/pairedChildren/${childCode}: true
 */
export async function savePairedChildToParent(parentUid: string, childCode: string): Promise<void> {
  if (!parentUid || !childCode) return;
  const childRef = ref(db, `users/${parentUid}/pairedChildren/${childCode}`);
  await set(childRef, true);
}

/**
 * Odebere spárované dítě z účtu rodiče.
 */
export async function removePairedChildFromParent(parentUid: string, childCode: string): Promise<void> {
  if (!parentUid || !childCode) return;
  const childRef = ref(db, `users/${parentUid}/pairedChildren/${childCode}`);
  await remove(childRef);
}

/**
 * Načte všechna spárovaná zařízení (kódy) patřící k účtu rodiče.
 */
export async function getPairedChildren(parentUid: string): Promise<string[]> {
  if (!parentUid) return [];
  const snapshot = await get(ref(db, `users/${parentUid}/pairedChildren`));
  if (snapshot.exists()) {
    const val = snapshot.val();
    return Object.keys(val || {});
  }
  return [];
}

/**
 * Poslouchá změny v seznamu spárovaných dětí rodiče v reálném čase.
 */
export function subscribeToParentPairedChildren(
  parentUid: string,
  callback: (childCodes: string[]) => void
): () => void {
  if (!parentUid) {
    callback([]);
    return () => {};
  }
  const userChildrenRef = ref(db, `users/${parentUid}/pairedChildren`);
  return onValue(userChildrenRef, (snapshot) => {
    if (snapshot.exists()) {
      const val = snapshot.val();
      callback(Object.keys(val || {}));
    } else {
      callback([]);
    }
  });
}

/**
 * Překlad chybových kódů Firebase Auth do přátelských českých hlášení.
 */
export function getAuthErrorMessage(error: any): string {
  if (!error) return 'Došlo k neznámé chybě.';
  const code = error.code || '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'Tento e-mail je již registrován. Zvolte prosím přihlášení.';
    case 'auth/invalid-email':
      return 'Neplatný formát e-mailové adresy.';
    case 'auth/weak-password':
      return 'Heslo je příliš krátké nebo slabé. Musí mít alespoň 6 znaků.';
    case 'auth/wrong-password':
      return 'Nesprávné heslo. Zkontrolujte zadané údaje.';
    case 'auth/user-not-found':
      return 'Účet s tímto e-mailem nebyl nalezen. Zaregistrujte se prosím.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Nesprávný e-mail nebo heslo.';
    case 'auth/user-disabled':
      return 'Tento uživatelský účet byl zablokován.';
    case 'auth/too-many-requests':
      return 'Příliš mnoho neúspěšných pokusů. Zkuste to prosím za chvíli.';
    case 'auth/network-request-failed':
      return 'Chyba připojení k internetu. Zkontrolujte síťové připojení.';
    default:
      return error.message || 'Nastala chyba při ověřování. Zkuste to prosím znovu.';
  }
}
