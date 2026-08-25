// Conversation tree for the chatbot widget.
// Each node has a bot message, then a list of options the user can pick.
// Leaf nodes have no options — they show the final answer.

export interface TreeNode {
  id: string;
  /** Bot message shown when this node is reached */
  botMessage: string;
  /** Clickable options shown after the bot message. Empty = leaf (final answer). */
  options?: TreeOption[];
}

export interface TreeOption {
  label: string;
  /** ID of the next TreeNode to navigate to */
  nextId: string;
}

export const CONVERSATION_TREE: Record<string, TreeNode> = {
  root: {
    id: 'root',
    botMessage: 'What can I help you with today?',
    options: [
      { label: 'Membership', nextId: 'membership' },
      { label: 'Books & Borrowing', nextId: 'books' },
      { label: 'Seat Booking', nextId: 'seats' },
      { label: 'Fines & Payments', nextId: 'fines' },
      { label: 'Reading Clubs & Events', nextId: 'clubs' },
      { label: 'Donations', nextId: 'donations' },
      { label: 'Account & Profile', nextId: 'account' },
    ],
  },

  // ── Membership ──────────────────────────────────────────────────────────────
  membership: {
    id: 'membership',
    botMessage: 'What would you like to know about membership?',
    options: [
      { label: 'How do I become a member?', nextId: 'membership_join' },
      { label: 'How do I renew my membership?', nextId: 'membership_renew' },
    ],
  },
  membership_join: {
    id: 'membership_join',
    botMessage:
      '1. Open the Register page.\n2. Choose the member role that fits you.\n3. Fill in your name, email, and contact details.\n4. Submit the form to create your membership.',
  },
  membership_renew: {
    id: 'membership_renew',
    botMessage:
      '1. Open your Profile.\n2. Go to the Membership section.\n3. Select Upgrade membership.\n4. Confirm your details and complete payment if required.',
  },

  // ── Books & Borrowing ────────────────────────────────────────────────────────
  books: {
    id: 'books',
    botMessage: 'What would you like to know about books?',
    options: [
      { label: 'How do I borrow a book?', nextId: 'books_borrow' },
      { label: 'How do I renew a borrowed book?', nextId: 'books_renew' },
      { label: 'How do I reserve an unavailable book?', nextId: 'books_reserve' },
      { label: 'How do I request a new title?', nextId: 'books_request' },
      { label: 'What if I lose a book?', nextId: 'books_lost' },
    ],
  },
  books_borrow: {
    id: 'books_borrow',
    botMessage:
      '1. Visit the Books page.\n2. Select an available title.\n3. Choose Borrow or Reserve.\n4. Confirm your borrowing details.',
  },
  books_renew: {
    id: 'books_renew',
    botMessage:
      '1. Open My Account or Reservations.\n2. Find the book you have borrowed.\n3. Click Renew if the book is eligible.\n4. Confirm the new return date.',
  },
  books_reserve: {
    id: 'books_reserve',
    botMessage:
      '1. Find the unavailable book on the Books page.\n2. Choose Reserve to place a hold.\n3. You will be notified when the book becomes available.',
  },
  books_request: {
    id: 'books_request',
    botMessage:
      '1. Open the Request a Book form or contact the Books & Clubs department.\n2. Provide the title, author, and edition.\n3. Submit your request for review.\n4. We will follow up with availability details.',
  },
  books_lost: {
    id: 'books_lost',
    botMessage:
      '1. Report the lost book through your account or the library desk.\n2. You may be charged a replacement fee.\n3. Contact the Pricing & Fines department for assistance.\nEmail: pricing@readingclub.org\nPhone: +1 (555) 010-2001',
  },

  // ── Seat Booking ─────────────────────────────────────────────────────────────
  seats: {
    id: 'seats',
    botMessage: 'What would you like to know about seat booking?',
    options: [
      { label: 'How do I reserve a seat?', nextId: 'seats_reserve' },
      { label: 'How do I cancel a seat reservation?', nextId: 'seats_cancel' },
      { label: 'Why is my preferred seat unavailable?', nextId: 'seats_unavailable' },
      { label: 'How many bookings can I make per week?', nextId: 'seats_limit' },
    ],
  },
  seats_reserve: {
    id: 'seats_reserve',
    botMessage:
      '1. Navigate to the Seat Booking page.\n2. Select your preferred date and time slot.\n3. Choose an available seat from the seating map.\n4. Confirm your reservation.\n5. A confirmation notification will be displayed.',
  },
  seats_cancel: {
    id: 'seats_cancel',
    botMessage:
      '1. Open My Reservations.\n2. Find the seat reservation you want to cancel.\n3. Click Cancel reservation.\n4. Confirm the cancellation.',
  },
  seats_unavailable: {
    id: 'seats_unavailable',
    botMessage:
      'Your preferred seat may already be booked or temporarily unavailable.\nPlease choose another slot or time, or contact the Seat Booking department.\nEmail: booking@readingclub.org\nPhone: +1 (555) 010-2003',
  },
  seats_limit: {
    id: 'seats_limit',
    botMessage:
      'Most members can make up to five seat bookings per week.\nIf you need additional access, contact the Seat Booking department.\nEmail: booking@readingclub.org\nPhone: +1 (555) 010-2003',
  },

  // ── Fines & Payments ─────────────────────────────────────────────────────────
  fines: {
    id: 'fines',
    botMessage: 'What would you like to know about fines and payments?',
    options: [
      { label: 'How are overdue fines calculated?', nextId: 'fines_calculated' },
      { label: 'How do I pay my fines?', nextId: 'fines_pay' },
      { label: 'Can a fine be waived?', nextId: 'fines_waive' },
    ],
  },
  fines_calculated: {
    id: 'fines_calculated',
    botMessage:
      '1. Fines are based on the number of days overdue and the book type.\n2. Check your account for the exact amount owed.\n3. Review the fine details before paying.',
  },
  fines_pay: {
    id: 'fines_pay',
    botMessage:
      '1. Open My Account.\n2. Navigate to Fines & Payments.\n3. Review outstanding fines.\n4. Select Pay Now.\n5. Complete payment using the available payment method.',
  },
  fines_waive: {
    id: 'fines_waive',
    botMessage:
      'Fine waivers are reviewed on a case-by-case basis.\nPlease contact the Pricing & Fines department.\nEmail: pricing@readingclub.org\nPhone: +1 (555) 010-2001',
  },

  // ── Reading Clubs & Events ───────────────────────────────────────────────────
  clubs: {
    id: 'clubs',
    botMessage: 'What would you like to know about reading clubs and events?',
    options: [
      { label: 'How do I join a reading club?', nextId: 'clubs_join' },
      { label: 'How do I create a reading club?', nextId: 'clubs_create' },
      { label: 'How do I leave a club?', nextId: 'clubs_leave' },
      { label: 'How do I register for an event?', nextId: 'clubs_event' },
      { label: 'How can I volunteer?', nextId: 'clubs_volunteer' },
    ],
  },
  clubs_join: {
    id: 'clubs_join',
    botMessage:
      '1. Open the Reading Clubs section.\n2. Browse available clubs.\n3. Select a club that interests you.\n4. Click Join Club.\n5. Your membership request will be submitted.',
  },
  clubs_create: {
    id: 'clubs_create',
    botMessage:
      'Reading club creation requests are reviewed by our community team.\nPlease contact the Books & Clubs department.\nEmail: clubs@readingclub.org\nPhone: +1 (555) 010-2002',
  },
  clubs_leave: {
    id: 'clubs_leave',
    botMessage:
      '1. Open the club details page.\n2. Select Leave Club.\n3. Confirm that you want to leave.\n4. Your membership will be removed immediately.',
  },
  clubs_event: {
    id: 'clubs_event',
    botMessage:
      '1. Open the Events page.\n2. Browse available events.\n3. Select an event and click Register.\n4. Confirm your registration details.',
  },
  clubs_volunteer: {
    id: 'clubs_volunteer',
    botMessage:
      '1. Visit the Events or Community page.\n2. Look for volunteer opportunities.\n3. Express interest for a role.\n4. Our team will follow up with next steps.',
  },

  // ── Donations ────────────────────────────────────────────────────────────────
  donations: {
    id: 'donations',
    botMessage: 'What would you like to know about donations?',
    options: [
      { label: 'How do I donate books?', nextId: 'donations_books' },
      { label: 'How do I donate funds?', nextId: 'donations_funds' },
      { label: 'What condition should donated books be in?', nextId: 'donations_condition' },
      { label: 'Will I receive a donation receipt?', nextId: 'donations_receipt' },
    ],
  },
  donations_books: {
    id: 'donations_books',
    botMessage:
      '1. Visit the Donations section or library desk.\n2. Prepare books in good condition.\n3. Drop them off at the designated donation area.\n4. We will review and add approved titles to the collection.',
  },
  donations_funds: {
    id: 'donations_funds',
    botMessage:
      '1. Open the Donations page.\n2. Select the contribution amount.\n3. Provide your payment details.\n4. Submit your donation.\n5. You will receive a confirmation receipt.',
  },
  donations_condition: {
    id: 'donations_condition',
    botMessage:
      'Please donate gently used books with intact covers, clean pages, and no missing content.\nFor large collections, contact the Donations department.\nEmail: donations@readingclub.org\nPhone: +1 (555) 010-2004',
  },
  donations_receipt: {
    id: 'donations_receipt',
    botMessage:
      'Yes. After you donate books or funds, we will send a donation receipt to your email address for your records.',
  },

  // ── Account & Profile ────────────────────────────────────────────────────────
  account: {
    id: 'account',
    botMessage: 'What would you like to know about your account?',
    options: [
      { label: 'How do I update my profile?', nextId: 'account_profile' },
      { label: 'How do I reset my password?', nextId: 'account_password' },
    ],
  },
  account_profile: {
    id: 'account_profile',
    botMessage:
      '1. Open your Profile page.\n2. Choose Edit profile.\n3. Update your personal details and save your changes.',
  },
  account_password: {
    id: 'account_password',
    botMessage:
      '1. Go to the Login page.\n2. Click Forgot password.\n3. Enter your email address.\n4. Follow the instructions in the reset email.',
  },
};
