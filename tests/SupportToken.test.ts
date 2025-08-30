import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface MintMetadata {
  minter: string;
  amount: number;
  timestamp: number;
  notes: string;
}

interface ContractState {
  balances: Map<string, number>;
  totalSupply: number;
  paused: boolean;
  owner: string;
  blacklisted: Map<string, boolean>;
  tokenUri: string | null;
  totalMinted: number;
  mintMetadata: Map<number, MintMetadata>;
  mintCounter: number;
}

// Mock contract implementation
class SupportTokenMock {
  private state: ContractState = {
    balances: new Map(),
    totalSupply: 1000000000, // Max supply
    paused: false,
    owner: "deployer",
    blacklisted: new Map(),
    tokenUri: "https://dsn.example.com/token-metadata.json",
    totalMinted: 0,
    mintMetadata: new Map(),
    mintCounter: 0,
  };

  private MAX_SUPPLY = 1000000000;
  private MAX_METADATA_LEN = 256;
  private ERR_OWNER_ONLY = 100;
  private ERR_INSUFFICIENT_BALANCE = 101;
  private ERR_INVALID_AMOUNT = 102;
  private ERR_PAUSED = 103;
  private ERR_BLACKLISTED = 104;
  private ERR_MAX_SUPPLY_REACHED = 105;
  private ERR_INVALID_RECIPIENT = 106;
  private ERR_ALREADY_BLACKLISTED = 107;
  private ERR_NOT_BLACKLISTED = 108;
  private ERR_UNAUTHORIZED = 109;
  private ERR_INVALID_METADATA = 110;

  getName(): ClarityResponse<string> {
    return { ok: true, value: "DSN Token" };
  }

  getSymbol(): ClarityResponse<string> {
    return { ok: true, value: "DSN" };
  }

  getDecimals(): ClarityResponse<number> {
    return { ok: true, value: 8 };
  }

  getTotalSupply(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalSupply };
  }

  getBalance(account: string): ClarityResponse<number> {
    return { ok: true, value: this.state.balances.get(account) ?? 0 };
  }

  getTokenUri(): ClarityResponse<string | null> {
    return { ok: true, value: this.state.tokenUri };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getBlacklisted(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.blacklisted.get(account) ?? false };
  }

  getTotalMinted(): ClarityResponse<number> {
    return { ok: true, value: this.state.totalMinted };
  }

  getMintMetadata(id: number): ClarityResponse<MintMetadata | null> {
    return { ok: true, value: this.state.mintMetadata.get(id) ?? null };
  }

  getMintCounter(): ClarityResponse<number> {
    return { ok: true, value: this.state.mintCounter };
  }

  transfer(caller: string, amount: number, sender: string, recipient: string, memo?: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (caller !== sender) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const senderBalance = this.state.balances.get(sender) ?? 0;
    if (senderBalance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    if (this.state.blacklisted.get(sender) ?? false) {
      return { ok: false, value: this.ERR_BLACKLISTED };
    }
    if (this.state.blacklisted.get(recipient) ?? false) {
      return { ok: false, value: this.ERR_BLACKLISTED };
    }
    this.state.balances.set(sender, senderBalance - amount);
    const recipientBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, recipientBalance + amount);
    return { ok: true, value: true };
  }

  mint(caller: string, amount: number, recipient: string, notes: string): ClarityResponse<boolean> {
    if (caller !== this.state.owner) {
      return { ok: false, value: this.ERR_OWNER_ONLY };
    }
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    if (this.state.totalMinted + amount > this.MAX_SUPPLY) {
      return { ok: false, value: this.ERR_MAX_SUPPLY_REACHED };
    }
    if (notes.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_INVALID_METADATA };
    }
    if (this.state.blacklisted.get(recipient) ?? false) {
      return { ok: false, value: this.ERR_BLACKLISTED };
    }
    const currentBalance = this.state.balances.get(recipient) ?? 0;
    this.state.balances.set(recipient, currentBalance + amount);
    this.state.totalMinted += amount;
    const id = this.state.mintCounter + 1;
    this.state.mintMetadata.set(id, {
      minter: caller,
      amount,
      timestamp: Date.now(),
      notes,
    });
    this.state.mintCounter = id;
    return { ok: true, value: true };
  }

  burn(caller: string, amount: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    if (amount <= 0) {
      return { ok: false, value: this.ERR_INVALID_AMOUNT };
    }
    const balance = this.state.balances.get(caller) ?? 0;
    if (balance < amount) {
      return { ok: false, value: this.ERR_INSUFFICIENT_BALANCE };
    }
    this.state.balances.set(caller, balance - amount);
    this.state.totalMinted -= amount;
    return { ok: true, value: true };
  }

  pause(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.owner) {
      return { ok: false, value: this.ERR_OWNER_ONLY };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpause(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.owner) {
      return { ok: false, value: this.ERR_OWNER_ONLY };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  blacklist(caller: string, account: string): ClarityResponse<boolean> {
    if (caller !== this.state.owner) {
      return { ok: false, value: this.ERR_OWNER_ONLY };
    }
    if (this.state.blacklisted.get(account) ?? false) {
      return { ok: false, value: this.ERR_ALREADY_BLACKLISTED };
    }
    this.state.blacklisted.set(account, true);
    return { ok: true, value: true };
  }

  unblacklist(caller: string, account: string): ClarityResponse<boolean> {
    if (caller !== this.state.owner) {
      return { ok: false, value: this.ERR_OWNER_ONLY };
    }
    if (!(this.state.blacklisted.get(account) ?? false)) {
      return { ok: false, value: this.ERR_NOT_BLACKLISTED };
    }
    this.state.blacklisted.delete(account);
    return { ok: true, value: true };
  }

  setTokenUri(caller: string, newUri: string | null): ClarityResponse<boolean> {
    if (caller !== this.state.owner) {
      return { ok: false, value: this.ERR_OWNER_ONLY };
    }
    this.state.tokenUri = newUri;
    return { ok: true, value: true };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  user1: "wallet_1",
  user2: "wallet_2",
  user3: "wallet_3",
};

describe("SupportToken Contract", () => {
  let contract: SupportTokenMock;

  beforeEach(() => {
    contract = new SupportTokenMock();
  });

  it("should initialize with correct token metadata", () => {
    expect(contract.getName()).toEqual({ ok: true, value: "DSN Token" });
    expect(contract.getSymbol()).toEqual({ ok: true, value: "DSN" });
    expect(contract.getDecimals()).toEqual({ ok: true, value: 8 });
    expect(contract.getTotalSupply()).toEqual({ ok: true, value: 1000000000 });
    expect(contract.getTokenUri()).toEqual({ ok: true, value: "https://dsn.example.com/token-metadata.json" });
  });

  it("should allow owner to mint tokens with metadata", () => {
    const mintResult = contract.mint(accounts.deployer, 1000, accounts.user1, "Initial mint");
    expect(mintResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 1000 });
    expect(contract.getTotalMinted()).toEqual({ ok: true, value: 1000 });

    const metadata = contract.getMintMetadata(1);
    expect(metadata).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount: 1000,
        minter: accounts.deployer,
        notes: "Initial mint",
      }),
    });
  });

  it("should prevent non-owner from minting", () => {
    const mintResult = contract.mint(accounts.user1, 1000, accounts.user2, "Unauthorized");
    expect(mintResult).toEqual({ ok: false, value: 100 });
  });

  it("should prevent minting beyond max supply", () => {
    contract.mint(accounts.deployer, 1000000000, accounts.user1, "Max mint");
    const overflowMint = contract.mint(accounts.deployer, 1, accounts.user1, "Overflow");
    expect(overflowMint).toEqual({ ok: false, value: 105 });
  });

  it("should prevent minting with long metadata", () => {
    const longNotes = "a".repeat(257);
    const mintResult = contract.mint(accounts.deployer, 1000, accounts.user1, longNotes);
    expect(mintResult).toEqual({ ok: false, value: 110 });
  });

  it("should allow token transfer", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1, "Test mint");
    const transferResult = contract.transfer(accounts.user1, 500, accounts.user1, accounts.user2);
    expect(transferResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 500 });
    expect(contract.getBalance(accounts.user2)).toEqual({ ok: true, value: 500 });
  });

  it("should prevent transfer when paused", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1, "Test mint");
    contract.pause(accounts.deployer);
    const transferResult = contract.transfer(accounts.user1, 500, accounts.user1, accounts.user2);
    expect(transferResult).toEqual({ ok: false, value: 103 });
  });

  it("should prevent transfer from blacklisted account", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1, "Test mint");
    contract.blacklist(accounts.deployer, accounts.user1);
    const transferResult = contract.transfer(accounts.user1, 500, accounts.user1, accounts.user2);
    expect(transferResult).toEqual({ ok: false, value: 104 });
  });

  it("should prevent transfer to blacklisted account", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1, "Test mint");
    contract.blacklist(accounts.deployer, accounts.user2);
    const transferResult = contract.transfer(accounts.user1, 500, accounts.user1, accounts.user2);
    expect(transferResult).toEqual({ ok: false, value: 104 });
  });

  it("should allow burning tokens", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1, "Test mint");
    const burnResult = contract.burn(accounts.user1, 300);
    expect(burnResult).toEqual({ ok: true, value: true });
    expect(contract.getBalance(accounts.user1)).toEqual({ ok: true, value: 700 });
    expect(contract.getTotalMinted()).toEqual({ ok: true, value: 700 });
  });

  it("should prevent burning when paused", () => {
    contract.mint(accounts.deployer, 1000, accounts.user1, "Test mint");
    contract.pause(accounts.deployer);
    const burnResult = contract.burn(accounts.user1, 300);
    expect(burnResult).toEqual({ ok: false, value: 103 });
  });

  it("should allow owner to blacklist and unblacklist", () => {
    const blacklistResult = contract.blacklist(accounts.deployer, accounts.user1);
    expect(blacklistResult).toEqual({ ok: true, value: true });
    expect(contract.getBlacklisted(accounts.user1)).toEqual({ ok: true, value: true });

    const unblacklistResult = contract.unblacklist(accounts.deployer, accounts.user1);
    expect(unblacklistResult).toEqual({ ok: true, value: true });
    expect(contract.getBlacklisted(accounts.user1)).toEqual({ ok: true, value: false });
  });

  it("should prevent non-owner from blacklisting", () => {
    const blacklistResult = contract.blacklist(accounts.user1, accounts.user2);
    expect(blacklistResult).toEqual({ ok: false, value: 100 });
  });

  it("should allow owner to set token URI", () => {
    const newUri = "https://new-uri.com";
    const setResult = contract.setTokenUri(accounts.deployer, newUri);
    expect(setResult).toEqual({ ok: true, value: true });
    expect(contract.getTokenUri()).toEqual({ ok: true, value: newUri });
  });

  it("should prevent non-owner from setting token URI", () => {
    const setResult = contract.setTokenUri(accounts.user1, "https://invalid.com");
    expect(setResult).toEqual({ ok: false, value: 100 });
  });

  it("should pause and unpause the contract", () => {
    const pauseResult = contract.pause(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });

    const mintDuringPause = contract.mint(accounts.deployer, 1000, accounts.user1, "Paused mint");
    expect(mintDuringPause).toEqual({ ok: false, value: 103 });

    const unpauseResult = contract.unpause(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });

    const mintAfterUnpause = contract.mint(accounts.deployer, 1000, accounts.user1, "Unpaused mint");
    expect(mintAfterUnpause).toEqual({ ok: true, value: true });
  });
});