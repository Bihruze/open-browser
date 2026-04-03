export interface Contact {
  name: string;
  address: string;
  chain: string;
  created: number;
}

export function getContacts(): Contact[];
export function saveContact(name: string, address: string, chain: string): void;
export function removeContact(address: string, chain: string): void;
export function getContactsForChain(chain: string): Contact[];
