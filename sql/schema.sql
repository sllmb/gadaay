-- ============================================================
--  GADAAY — Agence de Voyage  |  Sujet 6 — L2 GLSI 2026
--  Base de données : agence_voyage
-- ============================================================

CREATE DATABASE IF NOT EXISTS agence_voyage
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE agence_voyage;

-- ── TABLE : Destination ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS Destination (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  pays          VARCHAR(100) NOT NULL,
  ville         VARCHAR(100) NOT NULL,
  description   TEXT,
  duree_visa    INT DEFAULT 0 COMMENT 'Durée visa en jours (0 = pas de visa requis)',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── TABLE : Circuit ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Circuit (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20)  NOT NULL UNIQUE,
  libelle       VARCHAR(150) NOT NULL,
  id_destination INT NOT NULL,
  duree         INT          NOT NULL CHECK (duree > 0),
  prix_personne DECIMAL(12,2) NOT NULL CHECK (prix_personne > 0),
  nb_places_max INT          NOT NULL CHECK (nb_places_max > 0),
  image_url     VARCHAR(300),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_destination) REFERENCES Destination(id) ON DELETE RESTRICT
);

-- ── TABLE : Depart ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Depart (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  id_circuit      INT NOT NULL,
  date_depart     DATE NOT NULL,
  nb_places_restantes INT NOT NULL,
  statut          ENUM('ouvert','complet','annule') DEFAULT 'ouvert',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_circuit) REFERENCES Circuit(id) ON DELETE CASCADE,
  CHECK (nb_places_restantes >= 0)
);

-- ── TABLE : Guide ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Guide (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100) NOT NULL,
  langues       VARCHAR(200),
  telephone     VARCHAR(30),
  nb_voyageurs  INT DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── TABLE : Client ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Client (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  prenom        VARCHAR(100) NOT NULL,
  nationalite   VARCHAR(100),
  email         VARCHAR(150) NOT NULL UNIQUE,
  telephone     VARCHAR(30),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── TABLE : Reservation ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS Reservation (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(20) NOT NULL UNIQUE,
  id_client       INT NOT NULL,
  id_depart       INT NOT NULL,
  id_guide        INT,
  nb_personnes    INT NOT NULL CHECK (nb_personnes > 0),
  montant_total   DECIMAL(12,2) NOT NULL,
  statut          ENUM('en_attente','confirme','annule') DEFAULT 'en_attente',
  date_reservation DATE NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_client)  REFERENCES Client(id)    ON DELETE RESTRICT,
  FOREIGN KEY (id_depart)  REFERENCES Depart(id)    ON DELETE RESTRICT,
  FOREIGN KEY (id_guide)   REFERENCES Guide(id)     ON DELETE SET NULL
);

-- ── TABLE : Paiement ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Paiement (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  id_reservation  INT NOT NULL,
  montant         DECIMAL(12,2) NOT NULL CHECK (montant > 0),
  date_paiement   DATE NOT NULL,
  mode_paiement   ENUM('especes','virement','carte') NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_reservation) REFERENCES Reservation(id) ON DELETE CASCADE
);

-- ============================================================
--  TRIGGERS
-- ============================================================

DELIMITER $$

-- Décrémenter les places à la confirmation d'une réservation
CREATE TRIGGER trg_after_resa_confirm
AFTER UPDATE ON Reservation
FOR EACH ROW
BEGIN
  IF NEW.statut = 'confirme' AND OLD.statut != 'confirme' THEN
    UPDATE Depart
    SET nb_places_restantes = nb_places_restantes - NEW.nb_personnes
    WHERE id = NEW.id_depart;

    UPDATE Depart
    SET statut = 'complet'
    WHERE id = NEW.id_depart AND nb_places_restantes <= 0;
  END IF;

  -- Restituer les places en cas d'annulation
  IF NEW.statut = 'annule' AND OLD.statut = 'confirme' THEN
    UPDATE Depart
    SET nb_places_restantes = nb_places_restantes + NEW.nb_personnes,
        statut = 'ouvert'
    WHERE id = NEW.id_depart;
  END IF;
END$$

-- Vérifier que les places sont disponibles avant insertion
CREATE TRIGGER trg_before_resa_insert
BEFORE INSERT ON Reservation
FOR EACH ROW
BEGIN
  DECLARE places_dispo INT;
  SELECT nb_places_restantes INTO places_dispo
  FROM Depart WHERE id = NEW.id_depart;

  IF places_dispo < NEW.nb_personnes THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Places insuffisantes pour ce départ.';
  END IF;
END$$

DELIMITER ;

-- ============================================================
--  VUES
-- ============================================================

-- Vue : réservations avec solde impayé
CREATE OR REPLACE VIEW vue_soldes_impayes AS
SELECT
  r.id,
  r.code,
  CONCAT(c.prenom, ' ', c.nom) AS client,
  ci.libelle AS circuit,
  r.montant_total,
  COALESCE(SUM(p.montant), 0) AS total_paye,
  r.montant_total - COALESCE(SUM(p.montant), 0) AS solde_restant
FROM Reservation r
JOIN Client c     ON c.id = r.id_client
JOIN Depart d     ON d.id = r.id_depart
JOIN Circuit ci   ON ci.id = d.id_circuit
LEFT JOIN Paiement p ON p.id_reservation = r.id
WHERE r.statut != 'annule'
GROUP BY r.id
HAVING solde_restant > 0;

-- Vue : départs disponibles avec infos complètes
CREATE OR REPLACE VIEW vue_departs_disponibles AS
SELECT
  d.id,
  d.date_depart,
  d.nb_places_restantes,
  d.statut,
  ci.code,
  ci.libelle,
  ci.duree,
  ci.prix_personne,
  ci.image_url,
  dest.pays,
  dest.ville
FROM Depart d
JOIN Circuit ci  ON ci.id = d.id_circuit
JOIN Destination dest ON dest.id = ci.id_destination
WHERE d.statut = 'ouvert'
ORDER BY d.date_depart;

-- Vue : CA par destination
CREATE OR REPLACE VIEW vue_ca_par_destination AS
SELECT
  dest.pays,
  dest.ville,
  COUNT(DISTINCT r.id) AS nb_reservations,
  SUM(p.montant) AS ca_total
FROM Paiement p
JOIN Reservation r ON r.id = p.id_reservation
JOIN Depart d      ON d.id = r.id_depart
JOIN Circuit ci    ON ci.id = d.id_circuit
JOIN Destination dest ON dest.id = ci.id_destination
GROUP BY dest.id
ORDER BY ca_total DESC;

-- ============================================================
--  GESTION DES DROITS (LCD)
-- ============================================================

-- Créer utilisateur agent
CREATE USER IF NOT EXISTS 'agent'@'%' IDENTIFIED BY 'AgentGadaay2026!';
GRANT SELECT, INSERT, UPDATE ON agence_voyage.* TO 'agent'@'%';
REVOKE DELETE ON agence_voyage.* FROM 'agent'@'%';

-- Créer utilisateur comptable
CREATE USER IF NOT EXISTS 'comptable'@'%' IDENTIFIED BY 'ComptaGadaay2026!';
GRANT SELECT ON agence_voyage.* TO 'comptable'@'%';
GRANT INSERT, UPDATE ON agence_voyage.Paiement TO 'comptable'@'%';

FLUSH PRIVILEGES;

-- ── TABLE : Utilisateur ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS Utilisateur (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100)  NOT NULL,
  prenom        VARCHAR(100)  NOT NULL,
  email         VARCHAR(150)  NOT NULL UNIQUE,
  mot_de_passe  VARCHAR(255)  NOT NULL,
  role          ENUM('admin','agent','comptable') NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  DONNÉES DE TEST
-- ============================================================

INSERT INTO Destination (pays, ville, description, duree_visa) VALUES
('Sénégal',       'Dakar',     'Capitale vibrante sur l\'Atlantique',     0),
('Mali',           'Djenné',    'Patrimoine UNESCO, mosquée en banco',      30),
('Cap-Vert',       'Praia',     'Archipel volcanique, plages paradisiaques',30),
('Bénin',          'Cotonou',   'Vaudou, Ouidah, histoire fascinante',      30),
('Ghana',          'Accra',     'Plages dorées et culture Ashanti',         0);

INSERT INTO Circuit (code, libelle, id_destination, duree, prix_personne, nb_places_max, image_url) VALUES
('CIR-001','Dakar Classique',    1, 5, 175000, 20,'https://images.unsplash.com/photo-1589308078059-be1415eab4c3?w=800&q=80'),
('CIR-002','Sahel Explorer',     2,10, 350000, 15,'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800&q=80'),
('CIR-003','Cap-Vert Évasion',   3, 7, 290000, 25,'https://images.unsplash.com/photo-1568654116679-e9736e6dfc31?w=800&q=80'),
('CIR-004','Bénin Découverte',   4, 8, 310000, 18,'https://images.unsplash.com/photo-1578895101408-1a36b834405b?w=800&q=80'),
('CIR-005','Ghana & Accra',      5, 6, 260000, 20,'https://images.unsplash.com/photo-1566140967404-b8b3932483f5?w=800&q=80');

INSERT INTO Depart (id_circuit, date_depart, nb_places_restantes, statut) VALUES
(1,'2026-06-05',  4,'complet'),
(2,'2026-06-10',  8,'ouvert'),
(3,'2026-06-15', 12,'ouvert'),
(4,'2026-06-18',  0,'complet'),
(5,'2026-06-22',  6,'ouvert');

INSERT INTO Guide (nom, prenom, langues, telephone, nb_voyageurs) VALUES
('Ndiaye',  'Cheikh',   'Français, Wolof, Anglais',        '+221 77 111 22 33', 48),
('Traoré',  'Karim',    'Français, Bambara, Anglais',      '+221 76 222 33 44', 62),
('Baldé',   'Aissatou', 'Français, Poular, Espagnol',      '+221 70 333 44 55', 35),
('Mensah',  'Kofi',     'Anglais, Twi, Français',          '+233 24 444 55 66', 41);

INSERT INTO Client (nom, prenom, nationalite, email, telephone) VALUES
('Diallo',   'Fatou',    'Sénégalaise',   'fatou.diallo@mail.sn',    '+221 77 123 45 67'),
('Koné',     'Moussa',   'Malienne',      'moussa.kone@mail.ml',     '+223 70 234 56 78'),
('Sow',      'Aminata',  'Sénégalaise',   'aminata.sow@mail.sn',     '+221 76 345 67 89'),
('Ba',       'Ousmane',  'Sénégalaise',   'ousmane.ba@mail.sn',      '+221 70 456 78 90'),
('Dieng',    'Mariama',  'Sénégalaise',   'mariama.dieng@mail.sn',   '+221 77 567 89 01'),
('Fall',     'Ibrahima', 'Sénégalaise',   'ibrahima.fall@mail.sn',   '+221 78 678 90 12'),
('Camara',   'Adama',    'Guinéenne',     'adama.camara@mail.gn',    '+224 62 789 01 23'),
('Touré',    'Seydou',   'Malienne',      'seydou.toure@mail.ml',    '+223 76 890 12 34');

INSERT INTO Reservation (code, id_client, id_depart, id_guide, nb_personnes, montant_total, statut, date_reservation) VALUES
('R-001', 1, 2, 1, 1, 350000, 'confirme', '2026-05-20'),
('R-002', 2, 3, 2, 1, 290000, 'confirme', '2026-05-22'),
('R-003', 3, 5, 3, 2, 520000, 'confirme', '2026-05-25'),
('R-004', 4, 2, 1, 1, 350000, 'confirme', '2026-05-15'),
('R-005', 5, 3, 2, 2, 580000, 'confirme', '2026-05-18'),
('R-006', 6, 1, 4, 3, 525000, 'confirme', '2026-05-10');

INSERT INTO Paiement (id_reservation, montant, date_paiement, mode_paiement) VALUES
(1, 105000, '2026-05-20', 'especes'),
(2,  87000, '2026-05-22', 'virement'),
(3, 156000, '2026-05-25', 'carte'),
(4, 350000, '2026-05-15', 'virement'),
(5, 580000, '2026-05-18', 'carte'),
(6, 525000, '2026-05-10', 'especes');
