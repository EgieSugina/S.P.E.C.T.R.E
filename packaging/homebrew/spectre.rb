# Homebrew formula template for SPECTRE releases.
# Usage: brew install --formula packaging/homebrew/spectre.rb
# Or publish to a tap with version/url/sha256 updated per release.
class Spectre < Formula
  desc "Secure Proxy & Encrypted Connection Tunneling Remote Environment"
  homepage "https://github.com/EgieSugina/S.P.E.C.T.R.E"
  version "REPLACE_VERSION"
  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/EgieSugina/S.P.E.C.T.R.E/releases/download/v#{version}/spectre_darwin_arm64.tar.gz"
      sha256 "REPLACE_SHA256_ARM64"
    else
      url "https://github.com/EgieSugina/S.P.E.C.T.R.E/releases/download/v#{version}/spectre_darwin_x86_64.tar.gz"
      sha256 "REPLACE_SHA256_AMD64"
    end
  end
  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/EgieSugina/S.P.E.C.T.R.E/releases/download/v#{version}/spectre_linux_arm64.tar.gz"
      sha256 "REPLACE_SHA256_ARM64"
    else
      url "https://github.com/EgieSugina/S.P.E.C.T.R.E/releases/download/v#{version}/spectre_linux_x86_64.tar.gz"
      sha256 "REPLACE_SHA256_AMD64"
    end
  end

  def install
    bin.install "spectre"
  end

  test do
    assert_match "spectre", shell_output("#{bin}/spectre version")
  end
end
