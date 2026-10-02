import type { DataStore, StoreScope } from '../database/data-store';

export interface ProfileChild {
  id: string;
  firstName: string;
  age: number;
  grade: string;
  readingLevel: string;
  learningGoals: string[];
  gameplayStyle: string;
}

export interface ProfileParent {
  firstName: string;
  lastName: string;
  relationship: string;
  email: string;
  phone: string | null;
}

export interface FullProfile {
  username: string;
  status: 'pending' | 'active';
  createdAt: string;
  child: ProfileChild;
  parent: ProfileParent;
}

interface UsernameRecord {
  childId: string;
  status: 'pending' | 'active';
  createdAt: string;
}

interface ChildRecord {
  parentId: string;
  firstName: string;
  age: number;
  grade: string;
  readingLevel: string;
  learningGoals: string[];
  gameplayStyle: string;
}

interface ParentRecord {
  firstName: string;
  lastName: string;
  relationship: string;
  email: string;
  phone: string | null;
}

export async function loadProfile(
  store: StoreScope,
  username: string,
): Promise<FullProfile | undefined> {
  const usernameDoc = await store.get<UsernameRecord>(`usernames/${username}`);
  if (!usernameDoc) return undefined;
  return assembleProfile(store, username, usernameDoc.data);
}

export async function loadProfileByChildId(
  store: DataStore,
  childId: string,
): Promise<FullProfile | undefined> {
  const docs = await store.query<UsernameRecord>('usernames', {
    filters: [{ field: 'childId', op: '==', value: childId }],
    limit: 1,
  });
  if (docs.length === 0) return undefined;
  return assembleProfile(store, docs[0].id, docs[0].data);
}

async function assembleProfile(
  store: StoreScope,
  username: string,
  usernameRecord: UsernameRecord,
): Promise<FullProfile | undefined> {
  const childDoc = await store.get<ChildRecord>(`children/${usernameRecord.childId}`);
  if (!childDoc) return undefined;
  const parentDoc = await store.get<ParentRecord>(`parents/${childDoc.data.parentId}`);
  if (!parentDoc) return undefined;

  return {
    username,
    status: usernameRecord.status,
    createdAt: usernameRecord.createdAt,
    child: {
      id: usernameRecord.childId,
      firstName: childDoc.data.firstName,
      age: childDoc.data.age,
      grade: childDoc.data.grade,
      readingLevel: childDoc.data.readingLevel,
      learningGoals: Array.isArray(childDoc.data.learningGoals)
        ? childDoc.data.learningGoals.filter((goal): goal is string => typeof goal === 'string')
        : [],
      gameplayStyle: childDoc.data.gameplayStyle,
    },
    parent: {
      firstName: parentDoc.data.firstName,
      lastName: parentDoc.data.lastName,
      relationship: parentDoc.data.relationship,
      email: parentDoc.data.email,
      phone: parentDoc.data.phone,
    },
  };
}
