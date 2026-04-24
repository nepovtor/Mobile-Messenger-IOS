export type DemoAccount = {
  id: string;
  phone: string;
  code: string;
  displayName: string;
};

export type DemoChatSeed = {
  id: string;
  title: string;
  participantIDs: string[];
  messages: DemoMessageSeed[];
};

export type DemoMessageSeed = {
  id: string;
  senderID: string;
  text: string;
  createdAt: string;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    phone: "+10000000001",
    code: "111111",
    displayName: "Alex Carter",
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    phone: "+10000000002",
    code: "222222",
    displayName: "Maria Stone",
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    phone: "+10000000003",
    code: "333333",
    displayName: "Daniel Reed",
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    phone: "+10000000004",
    code: "444444",
    displayName: "Emily Brooks",
  },
];

export const DEMO_ACCOUNT_IDS = {
  alex: DEMO_ACCOUNTS[0].id,
  maria: DEMO_ACCOUNTS[1].id,
  daniel: DEMO_ACCOUNTS[2].id,
  emily: DEMO_ACCOUNTS[3].id,
} as const;

export const DEMO_CHATS: DemoChatSeed[] = [
  {
    id: "20000000-0000-0000-0000-000000000001",
    title: "Direct Chat",
    participantIDs: [DEMO_ACCOUNT_IDS.alex, DEMO_ACCOUNT_IDS.maria],
    messages: [
      {
        id: "30000000-0000-0000-0000-000000000001",
        senderID: DEMO_ACCOUNT_IDS.alex,
        text: "Hi Maria, the messenger demo is finally stable.",
        createdAt: "2026-04-20T09:00:00.000Z",
      },
      {
        id: "30000000-0000-0000-0000-000000000002",
        senderID: DEMO_ACCOUNT_IDS.maria,
        text: "Perfect. I'll verify it from my account later.",
        createdAt: "2026-04-20T09:02:00.000Z",
      },
    ],
  },
  {
    id: "20000000-0000-0000-0000-000000000002",
    title: "Direct Chat",
    participantIDs: [DEMO_ACCOUNT_IDS.alex, DEMO_ACCOUNT_IDS.daniel],
    messages: [
      {
        id: "30000000-0000-0000-0000-000000000003",
        senderID: DEMO_ACCOUNT_IDS.daniel,
        text: "Alex, I pushed the backend changes.",
        createdAt: "2026-04-20T10:15:00.000Z",
      },
    ],
  },
  {
    id: "20000000-0000-0000-0000-000000000003",
    title: "Study Group",
    participantIDs: [DEMO_ACCOUNT_IDS.alex, DEMO_ACCOUNT_IDS.maria],
    messages: [
      {
        id: "30000000-0000-0000-0000-000000000004",
        senderID: DEMO_ACCOUNT_IDS.maria,
        text: "Let's review the architecture slides tonight.",
        createdAt: "2026-04-20T12:30:00.000Z",
      },
    ],
  },
  {
    id: "20000000-0000-0000-0000-000000000004",
    title: "Direct Chat",
    participantIDs: [DEMO_ACCOUNT_IDS.maria, DEMO_ACCOUNT_IDS.emily],
    messages: [
      {
        id: "30000000-0000-0000-0000-000000000005",
        senderID: DEMO_ACCOUNT_IDS.emily,
        text: "Maria, I updated the new design draft.",
        createdAt: "2026-04-21T08:45:00.000Z",
      },
    ],
  },
  {
    id: "20000000-0000-0000-0000-000000000005",
    title: "Backend Discussion",
    participantIDs: [DEMO_ACCOUNT_IDS.daniel, DEMO_ACCOUNT_IDS.alex],
    messages: [
      {
        id: "30000000-0000-0000-0000-000000000006",
        senderID: DEMO_ACCOUNT_IDS.alex,
        text: "Let's keep REST and realtime payloads aligned.",
        createdAt: "2026-04-21T11:00:00.000Z",
      },
    ],
  },
  {
    id: "20000000-0000-0000-0000-000000000006",
    title: "Design Review",
    participantIDs: [DEMO_ACCOUNT_IDS.emily, DEMO_ACCOUNT_IDS.maria],
    messages: [
      {
        id: "30000000-0000-0000-0000-000000000007",
        senderID: DEMO_ACCOUNT_IDS.maria,
        text: "Emily, let's align the final presentation visuals.",
        createdAt: "2026-04-21T14:20:00.000Z",
      },
    ],
  },
];

export function findDemoAccountByPhone(phone: string) {
  return DEMO_ACCOUNTS.find((account) => account.phone === phone);
}
