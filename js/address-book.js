// js/address-book.js — Simple address book stored in localStorage

const STORAGE_KEY = 'ows-address-book';

export function getContacts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function saveContact(name, address, chain) {
  const contacts = getContacts();
  const existing = contacts.findIndex(c => c.address === address && c.chain === chain);
  if (existing >= 0) {
    contacts[existing].name = name;
  } else {
    contacts.push({ name, address, chain, created: Date.now() });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export function removeContact(address, chain) {
  const contacts = getContacts().filter(c => !(c.address === address && c.chain === chain));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export function getContactsForChain(chain) {
  return getContacts().filter(c => c.chain === chain);
}
